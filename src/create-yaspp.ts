#!/usr/bin/env node

import parseArgs from "minimist";
import fsPath from "path";
import { rimraf } from "rimraf";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { parse as parseJSON } from 'json5';
import readline from "readline";

import type { FileType, ICYSPArgv, ICYSPOptions, IProcessOptions, IProcessOutput, IRemoveFolderOptions, IResponse, IYasppConfig, Mutable } from "./cystypes";

const ROOT_FOLDER = fsPath.resolve(__dirname, "..");
const YASPP_REPO_URL = "git@github.com:imdfl/yaspp.git";


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

async function getVersion(): Promise<IResponse<string>> {
	const path = fsPath.join(ROOT_FOLDER, "package.json");
	const pkg = await utils.readJSON(path);
	return pkg?.version ? successResult(pkg.version) : errorResult("version not found");
}

function exit(err?: string): void {
	if (err) {
		console.error(err);
	}
	process.exit(err ? 1 : 0);
}

function printHelp(): void {
	console.log(`Usage: create-yassp
	--dry/-D: dry run
	--help: Print this help message
	--repository/-R <url>: the full URL of the content repository to clone
	--path/-P <path>: The file system path of the content to copy\n`)
}

async function copyContent(path: string, dry?: boolean): Promise<IResponse<string>> {
	const fullPath = fsPath.resolve(ROOT_FOLDER, path);
	try {
		const l = await fs.lstat(fullPath);
		if (!l?.isDirectory()) {
			return errorResult(`Error copying content: can't find folder ${path} (${fullPath})`);
		}
		console.log(`Copying ${path} (${fullPath})`);
		if (dry) {
			return successResult("");
		}
		return successResult("");
	}
	catch (error) {
		return errorResult(`Error copying content from ${path} (${fullPath})`);
	}
}

async function cloneContent(url: string, branch?: string, dry?: boolean): Promise<IResponse<string>> {
	console.log(`Trying to clone ${url}`);
	if (dry) {
		return successResult("");
	}
	try {
		const res = await utils.captureProcessOutput({
			exe: "git",
			argv: ["clone", url]
		})
	}
	catch (e) {
		return errorResult(`Error cloning ${url}:\n${e}`);
	}
	return successResult("");
}

async function generateYaspp(options: ICYSPOptions, dry?: boolean): Promise<IResponse<string>> {
	const yPath = fsPath.resolve(ROOT_FOLDER, "yaspp.json");
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
			console.log("Generating yassp.json:\n", y)
		}
		await fs.writeFile(yPath, JSON.stringify(y));
		return successResult(yPath);
	}
	catch (err) {
		return errorResult(`Error generating yaspp.json: ${err}`);
	}
}

function promptArgs() {
	console.log("==Project Configuration===\n");
	console.log(`- Default values are surrounded in [brackets]
- Mandatory options are marked with *
- If there's a default value, Enter one or more spaces to return an empty value\n`);
}

async function validateArgs(args: ICYSPArgv): Promise<IResponse<ICYSPOptions>> {
	const options: Partial<Mutable<ICYSPOptions>> = {
		repository: ""
	};
	const errors: string[] = [];
	const mandatory = true;
	if (!args.path) {
		options.repository = await utils.readInput({
			msg: "url of site repository to clone", defaultValue: args.repository
		});
	}
	if (!options.repository) {
		options.path = await utils.readInput({
			msg: "path the site folder on your file system", defaultValue: args.path
		});
	}
	if (options.repository && options.path) {
		errors.push("Can't specify both path and repository");
	}
	if (options.path) {
		const fullPath = fsPath.resolve(ROOT_FOLDER, options.path);
		if (!await utils.isFolder(fullPath)) {
			errors.push(`Content path ${options.path} not found (${fullPath})`);
		}
	}
	options.contentRoot = await utils.readInput({
		msg: "path of content folder relative to content root", defaultValue: args.contentRoot, mandatory
	});
	if (!options.contentRoot) {
		errors.push(`Content root cannot be empty`);
	}
	options.contentIndex = await utils.readInput({
		msg: "path of the folder that contains your index file, relative to the content root", mandatory,
		defaultValue: args.contentIndex
	});
	if (!options.contentIndex) {
		errors.push(`Content index cannot be empty`);
	}

	options.localeRoot = await utils.readInput({
		msg: "path of the locales, relative to the site root",
		defaultValue: args.localeRoot, mandatory
	});
	if (!options.localeRoot) {
		errors.push(`Locale root cannot be empty`);
	}

	options.styleRoot = await utils.readInput({
		msg: "path of styles folder relative to site root",
		defaultValue: args.styleRoot
	});
	if (options.styleRoot) {
		let ind = await utils.readInput({
			msg: "path of your main scss file, relative to the styles root",
			defaultValue: args.styleIndex, mandatory
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
		msg: "path of assets folder relative to site root",
		defaultValue: args.assetsRoot
	});
	options.langs = await utils.readInput({
		msg: `Site languages, as a comma/space separated list`,
		defaultValue: args.langs || "en", mandatory
	});
	const langs = utils.parseLangs(options.langs);
	if (langs.length === 0) {
		errors.push(`No legal language specified`);
	}
	options.defaultLocale = await utils.readInput({
		msg: `Default locale`, mandatory,
		defaultValue: options.defaultLocale || langs[0]
	});
	if (!options.defaultLocale || !langs.includes(options.defaultLocale)) {
		errors.push(`Invalid default locale "${options.defaultLocale}"`)
	}
	if (options.repository) {
		options.branch = await utils.readInput({
			msg: "branch to clone from site repository",
			defaultValue: args.branch
		})
	}
	else if (args.branch) {
		errors.push(`You specified branch ${args.branch} without a site repository`)
	}
	console.log("This is the current configuration:");
	console.log(JSON.stringify(options, null, '\t'));
	if (errors.length) {
		console.log(`Configuration errors:`);
		console.log(errors.join('\n'));
	}
	const again = await utils.confirm("Edit this configuration", Boolean(errors.length));
	if (again) {
		console.log("==Restart==");
		return validateArgs(options);
	}
	return errors.length ? errorResult(errors.join('\n')): successResult(options as ICYSPOptions);
}

async function main(args: ICYSPArgv): Promise<string> {
	const { dry, version, help, ...rest } = args;
	// console.log("create yaspp", args);
	if (help) {
		printHelp();
		exit();
	};
	if (version) {
		const ver = await getVersion();
		console.log(`create yaspp version ${ver}`);
		exit();
	}
	if (dry) {
		console.log(`===yaspp dry run===`);
	}
	promptArgs();
	const validResult = await validateArgs(rest);
	if (validResult.error) {
		return validResult.error;
	}
	return await createApp(validResult.result!);
}

async function createApp(options: ICYSPOptions, dry?: boolean): Promise<string> {
	let contentPath = "";
	if (options.path) {
		const copyRes = await copyContent(options.path, dry);
		if (copyRes.error) {
			return copyRes.error;
		}
		contentPath = copyRes.result!;
	}
	else if (options.repository) {
		const cloneRes = await cloneContent(options.repository, options.branch, dry);
		if (cloneRes.error) {
			return cloneRes.error;
		}
		contentPath = cloneRes.result!;
	}
	const yRes = await cloneContent(YASPP_REPO_URL, "master", dry);
	if (yRes.error) {
		return `Clone error: ${yRes.error}`;
	}

	const genRes = await generateYaspp(options, dry)
	return genRes.error ?? "";
}

class CYSUtils {

	public async captureProcessOutput({ cwd, exe, argv, env, onData, onError }: IProcessOptions): Promise<IProcessOutput> {
		const errCB = (onError === true) ?
			(s: string) => console.warn(`>${s}`) : onError!

		const dataCB = (onData === true) ?
			(s: string) => console.warn(`>${s}`) : onData

		return new Promise((resolve) => {
			try {
				const output: string[] = [];
				const errors: string[] = [];
				console.log(`Running ${exe} ${argv.join(' ')}`);
				const proc = spawn(exe, argv, {
					cwd: cwd || process.cwd(),
					env: env || {}
				});
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
	public async readJSON<T = Record<string, string>>(path: string): Promise<T | null> {
		try {
			const str = await fs.readFile(path, "utf-8");
			return parseJSON<T>(str);
		}
		catch (err) {
			console.error(`Error reading json data from ${path}: ${err}`);
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

	public async removeFolder({ path, removeRoot, mustExist = false }: IRemoveFolderOptions): Promise<boolean> {
		if (!await this.isFolder(path)) {
			return !mustExist;
		}
		const success = await rimraf(removeRoot ? path : `${path}/*`, {
			glob: !removeRoot
		});
		return success;
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
			return "";
		}
		catch (err) {
			return `mkdir ${path} failed: ${err}`;
		}
	}

	public readInput(options: { msg: string, defaultValue?: string, mandatory?: boolean }): Promise<string> {
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

}

const utils = new CYSUtils();

const unknownArgs = [] as string[];
const args = parseArgs(process.argv.slice(2), {
	alias: {
		R: "repository",
		P: "path",
		D: "dry"
	},
	"boolean": ["version", "dry", "help"],
	"default": { dry: false },
	"string": ["repository", "path"],
	"unknown": (s: string) => {
		const isArg = s.charAt(0) === "-";
		if (isArg) {
			unknownArgs.push(s)
		}
		return false;
	}
}) as ICYSPArgv;

if (unknownArgs.length) {
	printHelp();
	exit(`\nUnknown arguments ${unknownArgs}\n`);
}

main(args)
	.then(err => {
		exit(err);
	})
	.catch(err => {
		exit(String(err));
	});
