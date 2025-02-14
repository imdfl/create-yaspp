#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const minimist_1 = __importDefault(require("minimist"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const json5_1 = require("json5");
const readline_1 = __importDefault(require("readline"));
// Import generates an error due to some typing issue in @types/rimraf
const rimraf = require("rimraf");
const CSY_ROOT = path_1.default.resolve(__dirname, "..");
const PROJECT_ROOT = process.cwd();
const YASPP_REPO_URL = "git@github.com:imdfl/yaspp.git";
const SAVED_CONFIG = "yaspp.site.json";
function errorResult(err) {
    return {
        error: err || "error"
    };
}
function successResult(result) {
    return {
        result
    };
}
function stringify(obj) {
    return JSON.stringify(obj, null, '\t');
}
/**
 * Translate one string
 * @param key
 */
function t(key) {
    return utils.getString(key);
}
async function getVersion() {
    const path = path_1.default.join(CSY_ROOT, "package.json");
    const pkg = await utils.readJSON(path);
    return pkg?.version ? successResult(pkg.version) : errorResult("version not found");
}
function exit(err) {
    if (err) {
        console.error(err);
    }
    process.exit(err ? 1 : 0);
}
/**
 * Hard coded destination folder  "site" under cwd
 * @param path
 * @param dry
 * @returns
 */
async function copyContent(path, dry) {
    const srcPath = path_1.default.resolve(PROJECT_ROOT, path);
    const sitePath = path_1.default.resolve(PROJECT_ROOT, "site");
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
async function generateYaspp(options, dry) {
    const yPath = path_1.default.resolve(PROJECT_ROOT, YA);
    try {
        const y = {
            content: {
                root: options.contentRoot,
                index: options.contentIndex
            },
            locale: {
                root: options.localeRoot,
                langs: utils.parseLangs(options.langs),
                defaultLocale: options.defaultLocale,
                pages: {}
            },
            style: options.styleRoot ? {
                root: options.styleRoot,
                index: options.styleIndex
            } : undefined,
            assets: options.assetsRoot ? {
                root: options.assetsRoot
            } : undefined
        };
        if (dry) {
            console.log(`${t("generating")} ${YA}:\n`, y);
        }
        else {
            await fs_1.promises.writeFile(yPath, stringify(y));
        }
        return successResult(yPath);
    }
    catch (err) {
        return errorResult(`Error generating yaspp.json: ${err}`);
    }
}
/**
 * Interactively read the full configuration, providing the values in args as defaults
 * @param args
 * @param autoReply if true, don't prompt the user for input, use the provided values
 * @returns either error or a full configuration
 */
async function getConfiguration(args, autoReply) {
    const options = {
        repository: ""
    };
    autoReply = autoReply === true;
    const errors = [];
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
        const fullPath = path_1.default.resolve(PROJECT_ROOT, options.path);
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
        errors.push(`Invalid default locale "${options.defaultLocale}"`);
    }
    if (options.repository) {
        options.branch = await utils.readInput({
            msg: t("prompt_branch"),
            defaultValue: args.branch, autoReply
        });
    }
    else if (args.branch) {
        errors.push(`You specified branch ${args.branch} without a site repository`);
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
    return errors.length ? errorResult(errors.join('\n')) : successResult(options);
}
function adaptOptionsToPath(options, path) {
    if (!path) {
        return options;
    }
    const root = utils.diffPaths(PROJECT_ROOT, path);
    if (!root) {
        return options;
    }
    function addRoot(path) {
        return path ? `${root}/${path}` : path;
    }
    return {
        ...options,
        contentRoot: addRoot(options.contentRoot),
        styleRoot: addRoot(options.styleRoot),
        assetsRoot: addRoot(options.assetsRoot),
        localeRoot: addRoot(options.localeRoot)
    };
}
/**
 * Loads versions of required tools
 * @returns error message if any
 */
async function loadTools() {
    const errors = [];
    const ret = {};
    const tools = ["git", "yarn", "npm", "npx"];
    for await (const tool of tools) {
        const res = await utils.captureProcessOutput({
            exe: tool,
            argv: ["--version"]
        });
        if (res.status === 0) {
            ret[tool] = utils.parseVersion(res.output);
        }
    }
    return ret;
}
async function cloneYaspp(dry) {
    const yRes = await utils.cloneRepository({
        url: YASPP_REPO_URL, branch: "master", dry
    });
    return yRes.error ?
        `Clone error: ${yRes.error}` : "";
}
/**
 * Clones/Copies the content and generates yaspp.json
 * @param options
 * @param dry
 * @returns
 */
async function copySiteContent(options, dry) {
    let contentPath = "";
    if (options.path) {
        const copyRes = await copyContent(options.path, dry);
        if (copyRes.error) {
            return errorResult(copyRes.error);
        }
        contentPath = copyRes.result;
    }
    else if (options.repository) {
        const cloneRes = await utils.cloneRepository({
            url: options.repository,
            branch: options.branch,
            dry,
            folderName: "site"
        });
        if (cloneRes.error) {
            return errorResult(cloneRes.error);
        }
        contentPath = cloneRes.result;
    }
    const finalOptions = adaptOptionsToPath(options, contentPath);
    return successResult(finalOptions);
}
async function finalizeProject(tools) {
    if (!tools.yarn && !tools.npm) {
        return "neither yarn nor npm available";
    }
    function toCommandLine(script, argv) {
        return tools.yarn ? {
            exe: "yarn",
            argv: [script].concat(argv)
        } : {
            exe: "npm",
            argv: ["run", script].concat(argv)
        };
    }
    const onData = true, onError = true;
    const yarnRes = await utils.captureProcessOutput({
        cwd: path_1.default.resolve(PROJECT_ROOT, "yaspp"), onData, onError,
        ...toCommandLine("install", [])
    });
    if (yarnRes.status) {
        return `Failed to run yarn/npm`;
    }
    const initRes = await utils.captureProcessOutput({
        exe: "npx", onData, onError,
        argv: ["ts-node", "yaspp/scripts/build/init-yaspp", "--project", " ."]
    });
    if (initRes.status) {
        return `Failedto run init-yaspp`;
    }
    return "";
}
async function generateFiles(options) {
    try {
        await fs_1.promises.writeFile(path_1.default.resolve(PROJECT_ROOT, SAVED_CONFIG), stringify(options));
    }
    catch (err) {
        console.error(`Error saving config to ${SAVED_CONFIG}: ${err}`);
    }
    const copies = [
        { tmpl: "gitignore.tmpl", path: ".gitignore" },
        { tmpl: "package.json.tmpl", path: "package.json" },
    ];
    for await (const { path, tmpl } of copies) {
        const filePath = path_1.default.resolve(PROJECT_ROOT, path);
        if (!await utils.isFileOrFolder(filePath)) {
            const tmplData = await utils.readFile(utils.getTemplatePath(tmpl));
            if (!tmplData) {
                console.error(`Can't find ${path} template`);
            }
            else if (!await utils.writeFile(filePath, tmplData)) {
                console.error(`Failed to save ${path}`);
            }
        }
    }
    return "";
}
async function main(args) {
    const { dry, version, help, autoReply, refresh, config, ...rest } = args;
    // console.log("create yaspp", args);
    if (!await utils.loadStrings()) {
        return "Failed to load strings file";
    }
    if (help) {
        console.log(t("help"));
        exit();
    }
    ;
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
    let options = null;
    if (config || autoReply || refresh) {
        const configPath = path_1.default.resolve(PROJECT_ROOT, config || SAVED_CONFIG);
        options = await utils.readJSON(configPath);
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
    options = validResult.result;
    const siteRes = await copySiteContent(options, dry);
    if (siteRes.error) {
        return siteRes.error;
    }
    if (refresh) {
        return "";
    }
    const yspErr = await cloneYaspp(dry);
    if (yspErr) {
        return yspErr;
    }
    const genRes = await generateYaspp(siteRes.result, dry);
    if (genRes.error) {
        return genRes.error;
    }
    const gErr = await generateFiles(options);
    if (gErr) {
        return gErr;
    }
    const fErr = await finalizeProject(tools);
    if (fErr) {
        console.error(t("err_partial_setup"));
    }
    return "";
}
class CYSUtils {
    constructor() {
        this._dictionary = new Map();
    }
    getTemplatePath(name) {
        return path_1.default.join(__dirname, `../data/${name}`);
    }
    async loadStrings() {
        const dictPath = path_1.default.resolve(CSY_ROOT, "data/dict.json");
        const data = await this.readJSON(dictPath);
        if (data && typeof data === "object") {
            Object.entries(data).forEach(([key, value]) => {
                this._dictionary.set(key, value);
            });
            return true;
        }
        return false;
    }
    getString(key) {
        return this._dictionary.get(key) ?? (key || "");
    }
    /**
     * Clone a git repo with optional branch name and target folder  name
     * @returns either error or the path of the repo clone on the fs
     */
    async cloneRepository({ url, dry, branch, folderName }) {
        const repoName = url.replace(/^.+\/([^\.]+)\.git\s*$/, "$1");
        const sitePath = path_1.default.resolve(PROJECT_ROOT, folderName || repoName);
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
                exe: "git",
                argv: args
            });
            return successResult(sitePath);
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
    diffPaths(fromPath, toPath) {
        const fromParts = fromPath.split(/[\/\\]+/), toParts = toPath.split(/[\/\\]+/);
        let rest = "";
        const retParts = [];
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
    async copyFolderContent(srcPath, targetPath) {
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
            const list = await fs_1.promises.readdir(srcPath, { withFileTypes: true });
            for await (const dirent of list) {
                const srcChild = path_1.default.resolve(srcPath, dirent.name), trgChild = path_1.default.resolve(targetPath, dirent.name);
                if (dirent.isDirectory()) {
                    const childErr = await this.copyFolderContent(srcChild, trgChild);
                    if (childErr) {
                        await rmTarget();
                        return childErr;
                    }
                }
                else if (dirent.isFile()) {
                    await fs_1.promises.copyFile(srcChild, trgChild);
                }
            }
            return "";
        }
        catch (err) {
            await rmTarget();
            return `copy failed (${srcPath} to ${targetPath}:\n${err}`;
        }
    }
    async captureProcessOutput({ cwd, exe, argv, env, onData, onError }) {
        const errCB = (onError === true) ?
            (s) => console.warn(`>${s}`) : onError;
        const dataCB = (onData === true) ?
            (s) => console.log(`>${s}`) : onData;
        return new Promise((resolve) => {
            try {
                const output = [];
                const errors = [];
                console.log(`${t("running")} ${exe} ${argv.join(' ')}`);
                const proc = (0, child_process_1.spawn)(exe, argv, {
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
                        status: proc.exitCode
                    });
                });
            }
            catch (e) {
                resolve({
                    error: [String(e)],
                    output: [],
                    status: -1
                });
            }
        });
    }
    /**
 * Tries to parse the content of the file at `path`, swallows errors
 * @param path
 * @returns
 */
    async readFile(path) {
        try {
            const str = await fs_1.promises.readFile(path, "utf-8");
            return str;
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
    async readJSON(path) {
        try {
            const str = await this.readFile(path);
            if (!str) {
                return null;
            }
            return (0, json5_1.parse)(str);
        }
        catch (err) {
            console.error(`Error parsing json data from ${path}: ${err}`);
            return null;
        }
    }
    async getFileType(fspath) {
        try {
            const info = await fs_1.promises.lstat(fspath);
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
     * Swallows errors
     * @param param0
     * @returns
     */
    async removeFolder({ path, removeRoot, mustExist = false }) {
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
    async writeFile(path, data) {
        try {
            await fs_1.promises.writeFile(path, data);
            return true;
        }
        catch (err) {
            console.error(`Error saving to ${path}`);
            return false;
        }
    }
    async isFolder(fspath) {
        const t = await this.getFileType(fspath);
        return t === "folder";
    }
    async isFile(fspath) {
        const t = await this.getFileType(fspath);
        return t === "file";
    }
    async isFileOrFolder(fspath) {
        const t = await this.getFileType(fspath);
        return t === "folder" || t === "file";
    }
    /**
     * Recursive mkdir, swallows errors
     * @param path
     * @returns error message if any
     */
    async mkdir(path) {
        const t = await this.getFileType(path);
        if (t === "folder") {
            return "";
        }
        if (t) {
            return `file already exists at ${path}`;
        }
        try {
            await fs_1.promises.mkdir(path, { recursive: true });
            const success = await this.isFolder(path);
            return success ? "" : `Failed to create folder ${path}`;
        }
        catch (err) {
            return `mkdir ${path} failed: ${err}`;
        }
    }
    readInput(options) {
        if (options.autoReply) {
            return Promise.resolve(options.defaultValue || "");
        }
        const rl = readline_1.default.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        const { msg, defaultValue, mandatory } = options;
        const msgs = [];
        if (mandatory === true) {
            msgs.push("*");
        }
        msgs.push((msg || "").trimEnd());
        if (options.defaultValue) {
            msgs.push(`[${options.defaultValue}]`);
        }
        msgs.push(':');
        return new Promise(resolve => {
            rl.question(msgs.join(' '), function (input) {
                rl.close();
                resolve(input === "" ? defaultValue : input.trim());
            });
        });
    }
    async confirm(msg, defaultValue) {
        const def = defaultValue === true ? "Y" : defaultValue === false ? "N" : "";
        msg += " ([Y]es, [N]o) ?";
        const reply = await this.readInput({
            msg, defaultValue: def
        });
        return /^y|yes|ok|true$/i.test(reply);
    }
    parseLangs(langs) {
        const locRE = /^[a-zA-Z]{2,5}(?:[\-_][a-zA-Z]{2,5})?$/;
        return (langs || "").split(/[,\s]+/)
            .filter(locale => locRE.test(locale));
    }
    parseVersion(data) {
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
const unknownArgs = [];
const args = (0, minimist_1.default)(process.argv.slice(2), {
    alias: {
        R: "repository",
        P: "path",
        D: "dry",
        "autoReply": "auto",
        defaultLocale: "default-locale",
        contentRoot: "content-root",
        contentIndex: "content-index",
        localeRoot: "locale-root",
        assetsRoot: "assets-root",
        styleRoot: "style-root",
        styleIndex: "style-index",
    },
    "boolean": ["version", "dry", "help", "refresh", "auto"],
    "default": { dry: false, "default-locale": "en" },
    "string": ["config", "repository", "path", "branch", "langs",
        "content-root", "content-index",
        "locale-root", "assets-root",
        "style-root", "style-index"],
    "unknown": (s) => {
        const isArg = s.charAt(0) === "-";
        if (isArg) {
            unknownArgs.push(s);
        }
        return false;
    }
});
if (unknownArgs.length) {
    console.error(t("help"));
    exit(`${t("err_args")} ${unknownArgs}\n`);
}
main(args)
    .then(err => {
    exit(err);
})
    .catch(err => {
    exit(String(err));
});
//# sourceMappingURL=create-yaspp.js.map