#!/usr/bin/env ts-node

import parseArgs from "minimist";
import fsPath from "path";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { parse as parseJSON } from 'json5';
import readline from "readline";
import OS from "os";

import type { ErrorMessage, FileType, ICloneOptions, ICSYPSiteOptions,
	ICYSPArgv, ICYSPOptions, IProcessOptions, IProcessOutput,
	IRemoveFolderOptions, IResponse, IYasppConfig, Mutable
} from "./cystypes";

// Import generates an error due to some typing issue in @types/rimraf
const rimraf = require("rimraf");

const CSY_ROOT = fsPath.resolve(__dirname, "..");
const PROJECT_ROOT = process.cwd();
const YASPP_REPO_URL = "git@github.com:imdfl/yaspp.git";
const SAVED_CONFIG = "yaspp.site.json";
const YASPP_CONFIG = "yaspp.config.json";
const YASPP_NAV = "yaspp.nav.json";
const SITE_FOLDER = "site";

function errorResult<T>(err: string): IResponse<T> {
	return {
		error: err || "error"
	}
}

function successResult<T>(result: T): IResponse<T> {
	return {
		result
	}
}

function stringify<T extends object>(obj: T): string {
	return JSON.stringify(obj, null, '\t')
}

/**
 * Translate one string
 * @param key 
 */
function t(key: string): string {
	return utils.getString(key);
}

async function getVersion(): Promise<IResponse<string>> {
	const path = fsPath.join(CSY_ROOT, "package.json");
	const pkg = await utils.readJSON(path);
	return pkg?.version ? successResult(pkg.version) : errorResult("version not found");
}

function exit(err?: string): void {
	if (err) {
		console.error(err);
	}
	process.exit(err ? 1 : 0);
}

/**
 * Hard coded destination folder "site" under cwd
 * @param path the path to 
 * @param dry 
 * @returns 
 */
async function copyContent(path: string, target: string, dry?: boolean): Promise<IResponse<string>> {
	const srcPath = fsPath.resolve(PROJECT_ROOT, path);
	const sitePath = fsPath.resolve(target, SITE_FOLDER);
	try {
		console.log(`${t("copying")} ${path} (${srcPath})`);
		if (dry) {
			return successResult("");
		}
		const copyErr = await utils.copyFolderContent(srcPath, sitePath);
		return copyErr ? errorResult(copyErr) : successResult(sitePath);
	}
	catch (error) {
		return errorResult(`Error copying content from ${path} (${srcPath})`);
	}
}

function optionsToConfig(options: ICYSPOptions, navPath: string): IYasppConfig {
	return {
		content: {
			root: options.contentRoot,
			index: options.contentIndex,
		},
		nav: {
			index: navPath
		},
		locale: {
			root: options.localeRoot,
			langs: utils.parseLangs(options.langs!),
			defaultLocale: options.defaultLocale!,
			pages: {

			}
		},
		style: options.styleRoot ? {
			root: options.styleRoot,
			index: options.styleIndex!
		} : undefined,
		assets: options.assetsRoot ? {
			root: options.assetsRoot
		} : undefined
	};

}

/**
 * Generates yaspp.config.json in the root folder of the project
 * @param target path to target folder
 * @param config the configuration to write 
 * @param dry 
 * @returns 
 */
async function generateYaspp(target: string, config: IYasppConfig, dry?: boolean): Promise<IResponse<string>> {
	const yPath = fsPath.resolve(target, YASPP_CONFIG);
	if (dry) {
		console.log(`${t("generating")} ${YASPP_CONFIG}:\n`, config)
	}
	else {
		const success = await utils.writeFile(yPath, stringify(config));
		if (!success) {
			return errorResult(`Failed to generate ${YASPP_CONFIG}`)
		}
	}
	return successResult(yPath);
	
}

/**
 * Interactively read the full configuration, providing the values in args as defaults
 * @param args 
 * @param autoReply if true, don't prompt the user for input, use the provided values
 * @returns either error or a full configuration
 */
async function getConfiguration(args: Partial<ICYSPArgv>, autoReply: boolean): Promise<IResponse<ICYSPOptions>> {
	const options: Partial<Mutable<ICYSPOptions>> = {
	};

	autoReply = autoReply === true;
	const errors: string[] = [];
	const mandatory = true;
	options.contentRoot = await utils.readInput({
		msg: t("prompt_content_folder"), defaultValue: args.contentRoot, mandatory, autoReply
	});
	if (!options.contentRoot) {
		errors.push(`Content root cannot be empty`);
	}
	options.contentIndex = await utils.readInput({
		msg: t("prompt_content_index"), mandatory,
		defaultValue: args.contentIndex, autoReply
	});
	if (!options.contentIndex) {
		errors.push(`Content index cannot be empty`);
	}

	options.localeRoot = await utils.readInput({
		msg: t("prompt_locale_root"),
		defaultValue: args.localeRoot, mandatory, autoReply
	});
	if (!options.localeRoot) {
		errors.push(`Locale root cannot be empty`);
	}

	options.styleRoot = await utils.readInput({
		msg: t("prompt_style_root"),
		defaultValue: args.styleRoot, autoReply
	});
	if (options.styleRoot) {
		let ind = await utils.readInput({
			msg: t("prompt_style_index"),
			defaultValue: args.styleIndex, mandatory, autoReply
		});
		if (ind && !ind.includes('.')) {
			ind += ".scss";
		}
		options.styleIndex = ind;
		if (!options.styleIndex) {
			errors.push(`You specified styles root ${options.styleRoot}, so style index (custom scss file) cannot be empty`);
		}
	}
	options.assetsRoot = await utils.readInput({
		msg: t("prompt_assets_root"),
		defaultValue: args.assetsRoot, autoReply
	});
	options.langs = await utils.readInput({
		msg: t("prompt_langs"),
		defaultValue: args.langs || "en", mandatory, autoReply
	});
	const langs = utils.parseLangs(options.langs);
	if (langs.length === 0) {
		errors.push(`No legal language specified`);
	}
	options.defaultLocale = await utils.readInput({
		msg: t("prompt_locale"), mandatory,
		defaultValue: options.defaultLocale || langs[0], autoReply
	});
	if (!options.defaultLocale || !langs.includes(options.defaultLocale)) {
		errors.push(`Invalid default locale "${options.defaultLocale}"`)
	}
	console.log(t("prompt_print"));
	console.log(stringify(options));
	if (errors.length) {
		console.log(t("err_config"));
		console.log(errors.join('\n'));
	}
	if (!autoReply) {
		const again = await utils.confirm(t("prompt_edit"), Boolean(errors.length));
		if (again) {
			console.log(t("prompt_restart"));
			return getConfiguration(options, false);
		}
	}
	return errors.length ? errorResult(errors.join('\n')) : successResult(options as ICYSPOptions);
}


/**
 * Interactively read the full configuration, providing the values in args as defaults
 * @param args 
 * @param autoReply if true, don't prompt the user for input, use the provided values
 * @returns either error or a full configuration
 */
async function getContentConfiguration(args: Partial<ICYSPArgv>, autoReply?: boolean): Promise<IResponse<ICSYPSiteOptions>> {
	const options: Partial<Mutable<ICYSPOptions>> = {};

	autoReply = autoReply === true;
	const errors: string[] = [];
	if (!autoReply) {
		console.log(t("content_instructions"));
	}
	if (!args.path) {
		options.repository = await utils.readInput({
			msg: t("prompt_repo"), defaultValue: args.repository, autoReply
		});
	}
	if (!options.repository) {
		options.path = await utils.readInput({
			msg: t("prompt_path"), defaultValue: args.path, autoReply
		});
	}
	if (options.repository && options.path) {
		errors.push("Can't specify both path and repository");
	}
	if (options.path) {
		const fullPath = fsPath.resolve(PROJECT_ROOT, options.path);
		if (!await utils.isFolder(fullPath)) {
			errors.push(`Content path ${options.path} not found (${fullPath})`);
		}
	}
	if (options.repository) {
		options.branch = await utils.readInput({
			msg: t("prompt_branch"),
			defaultValue: args.branch, autoReply
		})
	}
	else if (args.branch) {
		errors.push(`You specified branch ${args.branch} without a site repository`)
	}
	console.log(t("prompt_print"));
	console.log(stringify(options));
	if (errors.length) {
		console.log(t("err_config"));
		console.log(errors.join('\n'));
	}
	if (!autoReply) {
		const again = await utils.confirm(t("prompt_edit"), Boolean(errors.length));
		if (again) {
			console.log(t("prompt_restart"));
			return getContentConfiguration(options);
		}
	}
	return errors.length ? errorResult(errors.join('\n')) : successResult({
		...options,
		clean: args.clean === true
	 } as ICSYPSiteOptions);
}

/**
 * 
 * @param config yaspp configuration, probably loaded from yaspp.config.json
 * @param sitePath full path of the folder into which the site was cloned/copied
 * @param navPath the RELATIVE path of the nav file 
 * @returns 
 */
function adaptConfigToPath(config: IYasppConfig, paths: {
	target: string, site: string, nav: string
	}): IYasppConfig {
	const root = paths.site ? utils.diffPaths(paths.target, paths.site) : "";

	function addRoot(path?: string) {
		return path && root ? `${root}/${path}` : path!
	}
	const ret: Mutable<IYasppConfig> = {
		content: {
			...config.content,
			root: addRoot(config.content.root),
		},
		nav: {
			index: paths.nav
		},
		locale: {
			...config.locale,
			root: addRoot(config.locale.root)
		}
	}
	if (config.assets?.root)  {
		ret.assets = {
			...config.assets,
			root: addRoot(config.assets.root)
		}
	}
	if (config.style?.root)  {
		ret.style = {
			...config.style,
			root: addRoot(config.style.root)
		}
	}

	return ret;
}

/**
 * Loads versions of required tools
 * @returns error message if any
 */
async function loadTools(): Promise<Record<string, string>> {
	const errors: string[] = [];
	const ret: Record<string, string> = {};
	const tools = ["git", "yarn", "npm", "npx"];
	for await (const tool of tools) {
		const res = await utils.captureProcessOutput({
			exe: tool,
			quiet: true,
			argv: ["--version"]
		});
		if (res.status === 0) {
			ret[tool] = utils.parseVersion(res.output);
		}
	}
	return ret

}

async function cloneYaspp(target: string, dry?: boolean): Promise<ErrorMessage> {
	const yRes = await utils.cloneRepository({
		url: YASPP_REPO_URL, branch: "master", dry, parentFolder: target
	});
	return yRes.error ?
		`Clone error: ${yRes.error}` : ""
}

/**
 * Copies the included sample site to the target folder
 * @param target
 */
async function copyDefaultSite(target: string, dry: boolean): Promise<IResponse<string>> {
	const trgFolder = fsPath.resolve(target, SITE_FOLDER);
	if (dry) {
		return successResult(trgFolder);
	}
	const srcFolder = fsPath.resolve(__dirname, "../data/sample-site");

	const copyErr = await utils.copyFolderContent(srcFolder, trgFolder);
	return copyErr ? errorResult(copyErr) : successResult(trgFolder);	
}

/**
 * Clones/Copies the content and generates yaspp.config.json
 * @param options 
 * @param dry 
 * @returns 
 */
async function copySiteContent(options: ICSYPSiteOptions, target: string, dry = false): Promise<IResponse<string>> {
	if (options.path) {
		const copyRes = await copyContent(options.path, target, dry);
		return copyRes;
	}
	else if (options.repository) {
		const cloneRes = await utils.cloneRepository({
			url: options.repository,
			parentFolder: target,
			branch: options.branch,
			dry,
			folderName: SITE_FOLDER
		});
		return cloneRes;
	}
	else { // no repo or content folder
		return await copyDefaultSite(target, dry);
	}
	// const finalOptions = adaptOptionsToPath(options, contentPath);

}

interface IFinalizeProjectOptions {
	readonly target: string;
	readonly tools: Record<string, string>;
	readonly dryrun: boolean,
	readonly siteFolder: string;
}

async function finalizeProject({
	target, tools, dryrun, siteFolder
}: IFinalizeProjectOptions): Promise<ErrorMessage> {
	if (!tools.yarn && !tools.npm) {
		return "neither yarn nor npm available";
	}
	function toCommandLine(script: string, argv: string[]): { exe: string, argv: string[] } {
		return tools.yarn ? {
			exe: "yarn",
			argv: [script].concat(argv)
		} : {
			exe: "npm",
			argv: ["run", script].concat(argv)
		}
	}
	const onData = true, onError = true;

	const installRes = await utils.captureProcessOutput({
		cwd: fsPath.resolve(target, "yaspp"), onData, onError, dryrun, onProgress: true,
		...toCommandLine("install", [])
	});
	if (installRes.status) {
		return `Failed to run yarn/npm`;
	}
	const sitePath = utils.diffPaths(target, siteFolder) || ".";
	const initRes = await utils.captureProcessOutput({
		exe: "npx", onData, onError, dryrun,
		cwd: target,
		argv: ["ts-node", "yaspp/scripts/build/init-yaspp", "--project", sitePath]
	})
	if (initRes.status) {
		return `Failed to run init-yaspp: ${initRes.errors}`;
	}
	return "";
}

async function generateFiles(target: string, options: ICYSPOptions | null, dry?: boolean): Promise<ErrorMessage> {
	const errors = [] as string[];
	try {
		console.log(`Generating ${SAVED_CONFIG}`);
		if (options && !dry) {
			await fs.writeFile(fsPath.resolve(target, SAVED_CONFIG), stringify(options));
		}
	}
	catch (err) {
		errors.push(`Error saving config to ${SAVED_CONFIG}: ${err}`);
	}
	const copies = [
		{ tmpl: "gitignore", path: ".gitignore" },
		{ tmpl: "package.json", path: "package.json" },
	];
	for await (const { path, tmpl } of copies) {
		const filePath = fsPath.resolve(PROJECT_ROOT, path);
		if (!await utils.isFileOrFolder(filePath)) {
			const tmplData = await utils.getTemplate(tmpl);
			if (!tmplData) {
				errors.push(`Can't find ${path} template`);
			}
			else {
				console.log(`Generating ${path}`);
				if (!dry) {
					if (!await utils.writeFile(filePath, tmplData)) {
						errors.push(`Failed to save ${path}`)
					}
				}
			}
		}
	}
	return errors.join('\n');
}

async function verifyTarget(target: string, {
	dryrun = false, content = true
}: Partial<ICYSPArgv>): Promise<ErrorMessage> {
	if (!dryrun) {
		if (await utils.mkdir(target)) {
			return `Failed to find or create target folder ${target}`;
		}
	}
	if (content === false) {
		return "";
	}
	const emptyRes = await utils.isEmpty(target, false);
	if (emptyRes.error) {
		return emptyRes.error;
	}
	if (emptyRes.result === false) {
		return `Target folder ${target} not empty`;
	}

	return "";
}

function validateSiteConfig(config: IYasppConfig | null): IYasppConfig | null {
	if (!config) {
		return null;
	}
	if (!config.content?.root || !config.content?.index
		|| !config.locale?.root) {
		return null;
	}
	const ret = {
		content: {
			root: config.content.root,
			index: config.content.index,
		},
		locale: {
			langs: config.locale.langs || ["en"],
			defaultLocale: config.locale.defaultLocale || "en",
			pages: config.locale.pages || {},
			root: config.locale.root
		},
		nav: {
			index: config.nav?.index
		}
	}
	if (config.assets?.root){
		Object.assign(ret, { assets: { root: config.assets.root}});
	}
	if (config.style?.root) {
		Object.assign(ret, { style: { root: config.style.root, index: config.style.index }})
	}
	return ret;
}

async function loadConfigFromProject(sitePath: string, autoReply: boolean): Promise<IYasppConfig | null> {
	const configPath = fsPath.resolve(sitePath, YASPP_CONFIG);
	const rawConfig = await utils.readJSON<IYasppConfig>(configPath);
	const siteConfig = validateSiteConfig(rawConfig);
	if (siteConfig && !autoReply) {
		const useIt = await utils.confirm(t("prompt_site_config"));
		if (!useIt) {
			return null;
		}
	}
	return siteConfig;
}

interface IVerifyNavOptions {
	projectRoot: string;
	sitePath: string;
	config: IYasppConfig | null;
	dry?: boolean;
}
async function verifySiteNav({ projectRoot, sitePath, config, dry }: IVerifyNavOptions): Promise<string> {
	if (!sitePath) {
		return "";
	}
	const relPath = config?.nav?.index || YASPP_NAV,
		navPath = fsPath.resolve(sitePath, relPath);
	const data = await utils.readJSON(navPath);
	if (data || dry) {
		return data ? navPath : "";
	}
	const tmpl = await utils.getTemplate("nav.json");
	if (!tmpl) {
		return "";
	}
	const trgPath = fsPath.resolve(projectRoot, YASPP_NAV);
	const success = await utils.writeFile(trgPath, tmpl);
	return success ? trgPath : "";
}

async function main(args: Partial<ICYSPArgv>): Promise<ErrorMessage> {
	const { dryrun: dry, version, help, autoReply = false, refresh = false, config, content, ...rest } = args;
	// console.log("create yaspp", args);
	if (help) {
		console.log(t("help"));
		exit();
	};
	if (version) {
		const ver = await getVersion();
		console.log(`${t("version_msg")} ${ver.result}`);
		exit();
	}
	if (dry) {
		console.log(t("dry_run"));
	}
	const tools = await loadTools();
	if (!tools.git || !tools.yarn) {
		return t("err_tools");
	}
	let options: ICYSPOptions | null = null;
	let siteConfig: IYasppConfig | null = null;
	const noContent = content === false;
	if (config || refresh) {
		const configPath = fsPath.resolve(PROJECT_ROOT, config || SAVED_CONFIG);
		console.log(`Loading configuration from ${config || SAVED_CONFIG}`)
		options = await utils.readJSON<ICYSPOptions>(configPath);
		if (!options) {
			return `${t("err_config_file")} ${utils.trimPath(configPath)}`;
		}
	}
	const target = fsPath.resolve(PROJECT_ROOT, args.target || ".");
	const targetErr = await verifyTarget(target, args);
	if (targetErr) {
		return targetErr;
	}
	const siteConfigResult = await getContentConfiguration(options || rest, autoReply || refresh);
	if (siteConfigResult.error) {
		return siteConfigResult.error;
	}
	const contentOptions = siteConfigResult.result!;
	const siteRes = await copySiteContent(contentOptions, target, dry || noContent);
	if (siteRes.error) {
		return siteRes.error;
	}
	if (refresh) { // refresh content only, done in  copySiteContent
		return "";
	}
	const sitePath = siteRes.result!;
	
	if (!options) {
		siteConfig = await loadConfigFromProject(sitePath, autoReply)
	}
	if (!siteConfig) {
		const validResult = await getConfiguration(options || rest, autoReply || refresh);
		if (validResult.error) {
			return validResult.error;
		}
		options = {
			...validResult.result!,
			...contentOptions
		}
	}

	const yspErr = await cloneYaspp(target, dry || noContent);
	if (yspErr) {
		return yspErr;
	}
	const fullNavPath = await verifySiteNav({
		projectRoot: target,
		sitePath, 
		config: siteConfig, 
		dry
	});
	if (!fullNavPath) {
		return `Failed to create site navigation file ${YASPP_NAV}`;
	}
	const navPath = utils.diffPaths(target, fullNavPath);

	const finalConfig = options ? optionsToConfig(options, navPath) : adaptConfigToPath(siteConfig!, {
		site: sitePath, nav: navPath, target
	});
	const genRes = await generateYaspp(target, finalConfig, dry)
	if (genRes.error) {
		return genRes.error;
	}

	const fErr = await finalizeProject({
		target, tools, dryrun: dry === true, siteFolder: sitePath
	});
	const gErr = await generateFiles(target, options, dry);
	if (fErr || gErr) {
		console.error([t("err_partial_setup"), fErr, gErr].filter(Boolean).join('\n'));
	}
	if (!dry) {
		utils.exploreToFile(target);
	}
	return "";
}


class CYSUtils {
	private _dictionary = new Map<string, string | string[]>();

	public async getTemplate(name: string): Promise<string> {
		const tmplPath = fsPath.resolve(CSY_ROOT, "data/templates", `${name}.tmpl`);
		const e = await this.readFile(tmplPath);
		return e || "";
	}

	public async loadStrings(): Promise<boolean> {
		const dictPath = fsPath.resolve(CSY_ROOT, "data/dict.json");
		const data = await this.readJSON(dictPath);
		if (data && typeof data === "object") {
			Object.entries(data).forEach(([key, value]) => {
				this._dictionary.set(key, value);
			})
			return true;
		}
		return false;
	}

	public getString(key: string): string {
		const value = this._dictionary.get(key);
		if (!value) {
			return key || "";
		}
		return Array.isArray(value) ? value.join('\n  ') + '\n' : value;
	}
	/**
	 * Clone a git repo with optional branch name and target folder  name
	 * @returns either error or the path of the repo clone on the fs
	 */
	public async cloneRepository({ url, dry, branch, folderName, parentFolder }: ICloneOptions): Promise<IResponse<string>> {
		const repoName = url.replace(/^.+\/([^\.]+)\.git\s*$/, "$1");
		const sitePath = fsPath.resolve(parentFolder, folderName || repoName);
		console.log(`${t("cloning")} ${url} to ${folderName || repoName}`);
		if (dry) {
			return successResult(sitePath);
		}
		try {
			await this.removeFolder({ path: sitePath, removeRoot: true, progress: true });
			const branchArgs = branch ? ["--branch", branch, "--single-branch"] : [];
			const args = ["clone", ...branchArgs, url];
			if (folderName) {
				args.push(folderName);
			}
			const res = await this.captureProcessOutput({
				cwd: parentFolder,
				onProgress: true,
				exe: "git",
				argv: args
			});
			return res.status ?
				errorResult(res.errors.join('\n'))
				: successResult(sitePath);
		}
		catch (e) {
			return errorResult(`Error cloning ${url}:\n${e}`);
		}
	}


	/**
	* Both paths point to folders
	* @param fromPath
	* @param toPath 
	*/
	public diffPaths(fromPath: string, toPath: string): string {
		const fromParts = fromPath.split(/[\/\\]+/),
			toParts = toPath.split(/[\/\\]+/);
		let rest = "";
		const retParts = [] as string[];
		for (let ind = 0, len = fromParts.length, toLen = toParts.length; ind < len; ++ind) {
			if (retParts.length || ind >= toLen) {
				retParts.push("..");
			}
			else if (fromParts[ind] !== toParts[ind]) {
				rest = toParts.slice(Math.min(ind, toParts.length - 1)).join('/');
				retParts.push("..");
			}
		}
		if (rest) {
			retParts.push(rest);
		}
		else if (toParts.length > fromParts.length) {
			retParts.push(...toParts.slice(fromParts.length));
		}

		const relPath = retParts.join('/');
		return relPath.length < toPath.length ? relPath : toPath;

	}

	/**
	 * Returns an error message, if any
	 * @param srcPath 
	 * @param targetPath 
	 */
	public async copyFolderContent(srcPath: string, targetPath: string): Promise<ErrorMessage> {
		if (!await this.isFolder(srcPath)) {
			return `Folder ${srcPath} not found`;
		}
		let err = await this.mkdir(targetPath);
		if (err) {
			return err;
		}
		if (targetPath.indexOf(srcPath) === 0) {
			return `Circular copy: ${srcPath} into ${targetPath}`;
		}

		// clean up old files
		async function rmTarget() {
			await utils.removeFolder({ path: targetPath, removeRoot: false });
		}
		try {
			await rmTarget();
			const list = await fs.readdir(srcPath, { withFileTypes: true });
			for await (const dirent of list) {
				const srcChild = fsPath.resolve(srcPath, dirent.name),
					trgChild = fsPath.resolve(targetPath, dirent.name);
				if (dirent.isDirectory()) {
					const childErr = await this.copyFolderContent(srcChild, trgChild);
					if (childErr) {
						await rmTarget();
						return childErr;
					}
				}
				else if (dirent.isFile()) {
					await fs.copyFile(srcChild, trgChild);
				}
			}
			return "";
		}
		catch (err) {
			await rmTarget();
			return `copy failed (${srcPath} to ${targetPath}:\n${err}`;
		}

	}

	public async captureProcessOutput(
		{
			cwd, exe, argv, env, onData, onError, dryrun, quiet, onProgress
		}: IProcessOptions): Promise<IProcessOutput> {
		const errCB = (onError === true) ?
			(s: string) => !quiet && console.warn(`>${s}`) : onError;

		const dataCB = (onData === true) ?
			(s: string) => !quiet && console.log(`>${s}`) : onData;

		const progress = typeof onProgress === "function" ? {
			callback: onProgress,
			cleanup: () => void 0,
			interval: null as NodeJS.Timeout | null
		} :
			onProgress === true ? {
				callback: () => process.stdout.write('.'),
				cleanup: () => console.log('done'),
				interval: null as NodeJS.Timeout | null
			}
				: null;

		if (!quiet) {
			console.log(`${t("running")} ${exe} ${argv.join(' ')}`);
		}
		if (dryrun) {
			return {
				status: 0,
				errors: [],
				output: []
			}
		}
		return new Promise<IProcessOutput>((resolve) => {
			const output: string[] = [];
			const errors: string[] = [];
			let resolved = false;
			function resolveWith(status: number, err?: string): void {
				if (!resolved) {
					resolved = true;
					resolve({
						status,
						errors: [err!, ...errors].filter(Boolean),
						output
					});
				}
			}
			try {
				const proc = spawn(exe, argv, {
					shell: true,
					cwd: cwd || process.cwd(),
					env: env || {}
				});
				if (progress) {
					progress.interval = setInterval(progress.callback, 100);
				}
				proc.on("error", err => {
					resolveWith(2, String(err));
				})
				proc.stderr.on('data', data => {
					errors.push(String(data));
					errCB && errCB(String(data));

				});
				proc.stdout.on('data', data => {
					output.push(String(data));
					dataCB && dataCB(String(data));
				});

				proc.on('close', function () {
					resolveWith(proc.exitCode!);
				});
			}
			catch (e) {
				resolveWith(3, String(e))
			}
		})
			.catch(err => ({
				status: 1,
				output: [],
				errors: [String(err)]
			}))
			.finally(() => {
				if (progress) {
					if (progress.interval) {
						clearInterval(progress.interval!);
						progress.interval = null;
					}
					progress.cleanup();
				}
			})
	}

	/**
 * Tries to parse the content of the file at `path`, swallows errors
 * @param path 
 * @returns 
 */
	public async readFile(path: string): Promise<string | null> {
		try {
			const str = await fs.readFile(path, "utf-8");
			return str
		}
		catch (err) {
			console.error(`Error reading data from ${path}: ${err}`);
			return null;
		}
	}

	/**
	 * Tries to parse the content of the file at `path`, swallows errors
	 * @param path 
	 * @returns 
	 */
	public async readJSON<T = Record<string, string>>(path: string): Promise<T | null> {
		try {
			const str = await this.readFile(path);
			if (!str) {
				return null;
			}
			return parseJSON<T>(str);
		}
		catch (err) {
			console.error(`Error parsing json data from ${path}: ${err}`);
			return null;
		}
	}

	public async getFileType(fspath: string): Promise<FileType> {
		try {
			const info = await fs.lstat(fspath);
			if (!info) {
				return "";
			}
			if (info.isDirectory()) {
				return "folder";
			}
			if (info.isFile()) {
				return "file";
			}
			return "other";
		}
		catch (e) {
			return "";
		}
	}

	/**
	 * Returns a path suitable for quick display, last 3 components
	 * @param path 
	 * @returns 
	 */
	public trimPath(path: string): string {
		const parts = path.split(/[\/\\]+/);
		return parts.slice(Math.max(0, parts.length - 3)).join('/');
	}

	/**
	 * Swallows errors
	 * @param options.mustExist If true, return an error if the folder doesn't exist, otherwise return success 
	 * @returns 
	 */
	public async removeFolder({ path, removeRoot, mustExist = false, progress }: IRemoveFolderOptions): Promise<boolean> {
		if (!await this.isFolder(path)) {
			return !mustExist;
		}
		let interval = progress ? setInterval(() => process.stdout.write('.')) : null;
		const removePath = removeRoot ? path : `${path}/*`;
		if (interval) {
			process.stdout.write(`Deleting ${removePath}`)
		}
		try {
			const success = await rimraf.rimraf(removePath, {
				glob: !removeRoot
			});
			return success;
		}
		catch (err) {
			return false;
		}
		finally {
			if (interval) {
				clearInterval(interval);
			}
		}
	}

	public async writeFile(path: string, data: string): Promise<boolean> {
		try {
			await fs.writeFile(path, data);
			return true;
		}
		catch (err) {
			console.error(`Error saving to ${path}`);
			return false;
		}
	}

	public async isFolder(fspath: string): Promise<boolean> {
		const t = await this.getFileType(fspath);
		return t === "folder";
	}
	public async isFile(fspath: string): Promise<boolean> {
		const t = await this.getFileType(fspath);
		return t === "file";
	}

	public async isFileOrFolder(fspath: string): Promise<boolean> {
		const t = await this.getFileType(fspath);
		return t === "folder" || t === "file";
	}

	public async isEmpty(folder: string, mustExist: boolean): Promise<IResponse<boolean>> {
		if (!await this.isFolder(folder)) {
			return mustExist ? errorResult(`Folder $`) : successResult(true);
		}
		try {
			const files = await fs.readdir(folder, { withFileTypes: true });
			for await (const d of files) {
				if (d.name === "." || d.name === "..") {
					continue;
				}

				if (d.isDirectory()) {
					const emptyRes = await this.isEmpty(fsPath.resolve(folder, d.name), mustExist);
					if (emptyRes.error) {
						return emptyRes;
					}
					if (emptyRes.result === false) {
						return successResult(false);
					}
					{
						return successResult(false);
					}
				}
				else {
					return successResult(false)
				}
			}
		}
		catch (e) {
			return errorResult(`Failed to read folder: ${e}`);
		}
		return successResult(true);
	}

	/**
	 * Recursive mkdir, swallows errors
	 * @param path 
	 * @returns error message if any
	 */
	public async mkdir(path: string): Promise<ErrorMessage> {
		const t = await this.getFileType(path);
		if (t === "folder") {
			return "";
		}
		if (t) {
			return `file already exists at ${path}`;
		}
		try {
			await fs.mkdir(path, { recursive: true });
			const success = await this.isFolder(path);
			return success ? "" : `Failed to create folder ${path}`;
		}
		catch (err) {
			return `mkdir ${path} failed: ${err}`;
		}
	}

	public readInput(options: { msg: string, defaultValue?: string, mandatory?: boolean, autoReply?: boolean }): Promise<string> {
		if (options.autoReply) {
			return Promise.resolve(options.defaultValue || "");
		}
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		const { msg, defaultValue, mandatory } = options;
		const msgs: string[] = [];
		if (mandatory === true) {
			msgs.push("*")
		}
		msgs.push((msg || "").trimEnd());
		if (options.defaultValue) {
			msgs.push(`[${options.defaultValue}]`);
		}
		msgs.push(':');
		return new Promise<string>(resolve => {
			rl.question(msgs.join(' '), function (input) {
				rl.close();
				resolve(input === "" ? defaultValue! : input.trim());
			})
		})
	}

	public async confirm(msg: string, defaultValue?: boolean): Promise<boolean> {
		const def = defaultValue === true ? "Y" : defaultValue === false ? "N" : "";
		msg += " ([Y]es, [N]o) ?"
		const reply = await this.readInput({
			msg, defaultValue: def
		});
		return /^y|yes|ok|true$/i.test(reply)
	}

	public parseLangs(langs: string): string[] {
		const locRE = /^[a-zA-Z]{2,5}(?:[\-_][a-zA-Z]{2,5})?$/;
		return (langs || "").split(/[,\s]+/)
			.filter(locale => locRE.test(locale));
	}

	public parseVersion(data: string | ReadonlyArray<string>): string {
		if (!data?.length) {
			return "";
		}
		const strs = typeof data === "string" ? [data]
			: Array.isArray(data) ? data : [];
		for (const str of strs) {
			const match = str.match(/\d+\.\d+(?:\.\d+)?/);
			if (match?.[0]) {
				return match[0];
			}
		}
		return "";
	}

	public exploreToFile(path: string): boolean {
		let cmd = ``;
		switch (OS.platform().toLowerCase().replace(/[0-9]/g, ``).replace(`darwin`, `macos`)) {
			case `win`:
				path = path || '.';
				cmd = `explorer`;
				break;
			case `linux`:
				path = path || '/';
				cmd = `xdg-open`;
				break;
			case `macos`:
				path = path || '/';
				cmd = `open`;
				break;
		}
		try {
			spawn(cmd, [path], { detached: true });
			return true;
		}
		catch (e) {
			return false;
		}
	}


}

const utils = new CYSUtils();

const unknownArgs = [] as string[];
const args = parseArgs(process.argv.slice(2), {
	alias: {
		R: "repository",
		P: "path",
		D: "dryrun",
		V: "version",
		T: "target",
		"autoReply": "auto",
		defaultLocale: "default-locale",
		contentRoot: "content-root",
		contentIndex: "content-index",
		localeRoot: "locale-root",
		assetsRoot: "assets-root",
		styleRoot: "style-root",
		styleIndex: "style-index",

	},
	"boolean": ["content", "version", "dryrun", "help", "refresh", "auto"],
	"default": { target: ".", dry: false, "default-locale": "en", "content": true },
	"string": ["config", "target", "repository", "path", "branch", "langs",
		"content-root", "content-index", "locale-root", "assets-root",
		"style-root", "style-index"],
	"unknown": (s: string) => {
		const isArg = s.charAt(0) === "-";
		if (isArg) {
			unknownArgs.push(s)
		}
		return false;
	}
}) as Partial<ICYSPArgv>;


utils.loadStrings()
	.then(success => {
		if (!success) {
			return "Failed to load strings file";
		}
		if (unknownArgs.length) {
			console.error(t("help"));
			exit(`${t("err_args")} ${unknownArgs}\n`);
		}
		main(args)
			.then(err => {
				exit(err);
			})
	})
	.catch(err => {
		exit(String(err));
	});
