#!/usr/bin/env ts-node

import parseArgs from "minimist";
import fsPath from "path";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { parse as parseJSON } from 'json5';
import readline from "readline";

import type { FileType, ICloneOptions, ICYSPArgv, ICYSPOptions, IMutableProcessOptions, IProcessOptions, IProcessOutput, IRemoveFolderOptions, IResponse, IYasppConfig, Mutable } from "./cystypes";
// Import generates an error due to some typing issue in @types/rimraf
const rimraf = require("rimraf");

const CSY_ROOT = fsPath.resolve(__dirname, "..");
const PROJECT_ROOT = process.cwd();
const YASPP_REPO_URL = "git@github.com:imdfl/yaspp.git";
const SAVED_CONFIG = "yaspp.site.json";
const YASPP_CONFIG = "yaspp.config.json";
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
	const sitePath = fsPath.resolve(target, "site");
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

/**
 * Generates yaspp.config.json in the root folder of the project
 * @param options 
 * @param dry 
 * @returns 
 */
async function generateYaspp(options: ICYSPOptions, dry?: boolean): Promise<IResponse<string>> {
	const yPath = fsPath.resolve(options.target, YASPP_CONFIG);
	try {
		const y: IYasppConfig = {
			content: {
				root: options.contentRoot,
				index: options.contentIndex
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
		if (dry) {
			console.log(`${t("generating")} ${YASPP_CONFIG}:\n`, y)
		}
		else {
			await fs.writeFile(yPath, stringify(y));
		}
		return successResult(yPath);
	}
	catch (err) {
		return errorResult(`Error generating ${YASPP_CONFIG}: ${err}`);
	}
}

/**
 * Interactively read the full configuration, providing the values in args as defaults
 * @param args 
 * @param autoReply if true, don't prompt the user for input, use the provided values
 * @returns either error or a full configuration
 */
async function getConfiguration(args: Partial<ICYSPArgv>, autoReply?: boolean): Promise<IResponse<ICYSPOptions>> {
	const options: Partial<Mutable<ICYSPOptions>> = {
		repository: "",
		target: fsPath.resolve(PROJECT_ROOT, args.target || "."),
		clean: args.clean === true
	};

	autoReply = autoReply === true;
	const errors: string[] = [];
	const mandatory = true;
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
			return getConfiguration(options);
		}
	}
	return errors.length ? errorResult(errors.join('\n')) : successResult(options as ICYSPOptions);
}

function adaptOptionsToPath(options: ICYSPOptions, path: string): ICYSPOptions {
	if (!path) {
		return options;
	}
	const root = utils.diffPaths(options.target, path);
	if (!root) {
		return options;
	}
	function addRoot(path?: string) {
		return path ? `${root}/${path}` : path
	}
	return {
		...options,
		contentRoot: addRoot(options.contentRoot)!,
		styleRoot: addRoot(options.styleRoot),
		assetsRoot: addRoot(options.assetsRoot),
		localeRoot: addRoot(options.localeRoot)!
	}
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

async function cloneYaspp(target: string, dry?: boolean): Promise<string> {
	const yRes = await utils.cloneRepository({
		url: YASPP_REPO_URL, branch: "master", dry, parentFolder: target
	});
	return yRes.error ?
		`Clone error: ${yRes.error}` : ""
}

/**
 * Clones/Copies the content and generates yaspp.config.json
 * @param options 
 * @param dry 
 * @returns 
 */
async function copySiteContent(options: ICYSPOptions, dry?: boolean): Promise<IResponse<ICYSPOptions>> {
	let contentPath = "";
	if (options.path) {
		const copyRes = await copyContent(options.path, options.target, dry);
		if (copyRes.error) {
			return errorResult(copyRes.error);
		}
		contentPath = copyRes.result!;
	}
	else if (options.repository) {
		const cloneRes = await utils.cloneRepository({
			url: options.repository,
			parentFolder: options.target,
			branch: options.branch,
			dry,
			folderName: "site"
		});
		if (cloneRes.error) {
			return errorResult(cloneRes.error);
		}
		contentPath = cloneRes.result!;
	}
	const finalOptions = adaptOptionsToPath(options, contentPath);
	return successResult(finalOptions);

}

async function finalizeProject(target: string, tools: Record<string, string>, dryrun?: boolean): Promise<string> {
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

	const yarnRes = await utils.captureProcessOutput({
		cwd: fsPath.resolve(target, "yaspp"), onData, onError, dryrun,
		...toCommandLine("install", [])
	});
	if (yarnRes.status) {
		return `Failed to run yarn/npm`;
	}
	const initRes = await utils.captureProcessOutput({
		exe: "npx", onData, onError, dryrun,
		argv: ["ts-node", "yaspp/scripts/build/init-yaspp", "--project", " ."]
	})
	if (initRes.status) {
		return `Failedto run init-yaspp`;
	}
	return "";
}

async function generateFiles(options: ICYSPOptions, dry?: boolean): Promise<string> {
	try {
		console.log(`Generating ${SAVED_CONFIG}`);
		if (!dry) {
			await fs.writeFile(fsPath.resolve(options.target, SAVED_CONFIG), stringify(options));
		}
	}
	catch (err) {
		console.error(`Error saving config to ${SAVED_CONFIG}: ${err}`);
	}
	const copies = [
		{ tmpl: "gitignore.tmpl", path: ".gitignore" },
		{ tmpl: "package.json.tmpl", path: "package.json" },
	];
	for await (const { path, tmpl } of copies) {
		const filePath = fsPath.resolve(PROJECT_ROOT, path);
		if (!await utils.isFileOrFolder(filePath)) {
			const tmplData = await utils.readFile(utils.getTemplatePath(tmpl));
			if (!tmplData) {
				console.error(`Can't find ${path} template`);
			}
			else {
				console.log(`Generating ${path}`);
				if (!dry) {
					if (!await utils.writeFile(filePath, tmplData)) {
						console.error(`Failed to save ${path}`)
					}
				}
			}
		}
	}
	return "";
}

async function verifyTarget({ clean = false, dryrun = false, autoReply }: Partial<ICYSPArgv>, { target,  }: ICYSPOptions): Promise<string> {
	if (!dryrun) {
		if (await utils.mkdir(target)) {
			return `Failed to find or create target folder ${target}`;
		}
	}
	const emptyRes = await utils.isEmpty(target, false);
	if (emptyRes.error) {
		return emptyRes.error;
	}
	const notEmpty = `Target folder ${target} not empty`;
	if (emptyRes.result === false) {
		if (dryrun) {
			return clean ? "" : `Target folder ${target} not empty`;
		}
		if (clean) {
			const rm = await utils.removeFolder({ path: target, removeRoot: false });
			return rm ? "" : notEmpty;
		}
		if (autoReply) {
			return notEmpty;
		}
		const remove = await utils.confirm(`Target folder ${utils.trimPath(target)} is not empty. Delete content`, false);
		if (!remove) {
			return notEmpty;
		}
		const rm = await utils.removeFolder({ path: target, removeRoot: false });
		return rm ? "" : notEmpty;
}

	return "";
}


async function main(args: Partial<ICYSPArgv>): Promise<string> {
	const { dryrun: dry, version, help, autoReply, refresh, config, content, ...rest } = args;
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
		console.log(`===${("dry_run")}===`);
	}
	const tools = await loadTools();
	if (!tools.git || !tools.yarn) {
		return t("err_tools");
	}
	let options: ICYSPOptions | null = null;
	const noContent = content === false;
	if (config || autoReply || refresh) {
		const configPath = fsPath.resolve(PROJECT_ROOT, config || SAVED_CONFIG);
		console.log(`Loading configuration from ${config || SAVED_CONFIG}`)
		options = await utils.readJSON<ICYSPOptions>(configPath);
		if (!options) {
			return `${t("err_config_file")} ${config} (${configPath})`;
		}
	}
	if (!autoReply) {
		console.log(t("instructions"));
	}
	const validResult = await getConfiguration(options || rest, autoReply || refresh);
	if (validResult.error) {
		return validResult.error;
	}
	options = validResult.result!;
	const emptyErr = await verifyTarget(args, options);
	if (emptyErr) {
		return emptyErr;
	}
	const siteRes = await copySiteContent(options, dry || noContent);
	if (siteRes.error) {
		return siteRes.error;
	}
	if (refresh) {
		return "";
	}
	const yspErr = await cloneYaspp(options.target, dry || noContent);
	if (yspErr) {
		return yspErr;
	}

	const genRes = await generateYaspp(siteRes.result!, dry)
	if (genRes.error) {
		return genRes.error;
	}

	const fErr = await finalizeProject(options.target, tools, dry);
	if (fErr) {
		console.error(`${t("err_partial_setup")}:\n${fErr}`);
	}
	const gErr = await generateFiles(options, dry);
	if (gErr) {
		return gErr;
	}
	return "";
}


class CYSUtils {
	private _dictionary = new Map<string, string>();

	public getTemplatePath(name: string): string {
		return fsPath.join(__dirname, `../data/${name}`);
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
		return this._dictionary.get(key) ?? (key || "");
	}
	/**
	 * Clone a git repo with optional branch name and target folder  name
	 * @returns either error or the path of the repo clone on the fs
	 */
	public async cloneRepository({ url, dry, branch, folderName, parentFolder }: ICloneOptions): Promise<IResponse<string>> {
		const repoName = url.replace(/^.+\/([^\.]+)\.git\s*$/, "$1");
		const sitePath = fsPath.resolve(parentFolder, folderName || repoName);
		console.log(`${t("cloning")} ${url}`);
		if (dry) {
			return successResult(sitePath);
		}
		try {
			await this.removeFolder({ path: sitePath, removeRoot: true });
			const branchArgs = branch ? ["--branch", branch, "--single-branch"] : [];
			const args = ["clone", ...branchArgs, url];
			if (folderName) {
				args.push(folderName);
			}
			const res = await this.captureProcessOutput({
				cwd: parentFolder,
				exe: "git",
				argv: args
			});
			return res.status ?
				errorResult(res.error.join('\n'))
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
	public async copyFolderContent(srcPath: string, targetPath: string): Promise<string> {
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

	public async captureProcessOutput({ cwd, exe, argv, env, onData, onError, dryrun, quiet }: IProcessOptions): Promise<IProcessOutput> {
		const errCB = (onError === true) ?
			(s: string) => !quiet && console.warn(`>${s}`) : onError!

		const dataCB = (onData === true) ?
			(s: string) => !quiet && console.log(`>${s}`) : onData

		if (!quiet) {
			console.log(`${t("running")} ${exe} ${argv.join(' ')}`);
		}
		if (dryrun) {
			return {
				status: 0,
				error: [],
				output: []
			}
		}
		return new Promise((resolve) => {
			try {
				const output: string[] = [];
				const errors: string[] = [];
				const proc = spawn(exe, argv, {
					shell: true,
					cwd: cwd || process.cwd(),
					env: env || {}
				});
				proc.on("error", err => {
					resolve({
						status: -1,
						error: [String(err)],
						output: []
					});
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
					resolve({
						output,
						error: errors,
						status: proc.exitCode!
					});
				});
			}
			catch (e) {
				resolve({
					error: [String(e)],
					output: [],
					status: -1
				})
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
	public async removeFolder({ path, removeRoot, mustExist = false }: IRemoveFolderOptions): Promise<boolean> {
		if (!await this.isFolder(path)) {
			return !mustExist;
		}
		try {
			const success = await rimraf.rimraf(removeRoot ? path : `${path}/*`, {
				glob: !removeRoot
			});
			return success;
		}
		catch (err) {
			return false;
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
			const files = await fs.readdir(folder, { withFileTypes: true});
			for await (const d of files) {
				if  (d.name === "." || d.name === "..") {
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
		catch(e) {
			return errorResult(`Failed to read folder: ${e}`);
		}
		return successResult(true);
	}

	/**
	 * Recursive mkdir, swallows errors
	 * @param path 
	 * @returns error message if any
	 */
	public async mkdir(path: string): Promise<string> {
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
	"boolean": ["clean", "content", "version", "dryrun", "help", "refresh", "auto"],
	"default": { clean: false, target: ".", dry: false, "default-locale": "en", "content": true },
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
