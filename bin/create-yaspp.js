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
const os_1 = __importDefault(require("os"));
// Import generates an error due to some typing issue in @types/rimraf
const rimraf = require("rimraf");
const CSY_ROOT = path_1.default.resolve(__dirname, "..");
const PROJECT_ROOT = process.cwd();
const YASPP_REPO_URL = "git@github.com:imdfl/yaspp.git";
const YASPP_CONFIG = "yaspp.config.json";
const SITE_FOLDER = "site";
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
 * Generates yaspp.config.json in the root folder of the project
 * @param target path to target folder
 * @param config the configuration to write
 * @param dry
 * @returns
 */
async function generateYasppConfig(target, config, dry) {
    const yPath = path_1.default.resolve(target, YASPP_CONFIG);
    if (dry) {
        console.log(`${t("generating")} ${YASPP_CONFIG}:\n`, config, '\n');
    }
    else {
        const data = typeof config === "string" ? config : stringify(config);
        const success = await utils.writeFile(yPath, data);
        if (!success) {
            return errorResult(`Failed to generate ${YASPP_CONFIG}`);
        }
    }
    return successResult(yPath);
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
            quiet: true,
            argv: ["--version"]
        });
        if (res.status === 0) {
            ret[tool] = utils.parseVersion(res.output);
        }
    }
    return ret;
}
async function cloneYaspp(target, branch, dry) {
    const yRes = await utils.cloneRepository({
        url: YASPP_REPO_URL, branch, dry, parentFolder: target
    });
    return yRes.error ?
        `Clone error: ${yRes.error}` : "";
}
/**
 * Copies the included sample site to the target folder
 * @param target
 */
async function copyDefaultSite(target, dry) {
    const trgFolder = path_1.default.resolve(target, SITE_FOLDER);
    if (!utils.isEmpty(trgFolder, false)) {
        return successResult(trgFolder);
    }
    if (dry) {
        return successResult(trgFolder);
    }
    const srcFolder = path_1.default.resolve(__dirname, "../data/sample-site");
    const copyErr = await utils.copyFolderContent(srcFolder, trgFolder);
    return copyErr ? errorResult(copyErr) : successResult(trgFolder);
}
async function finalizeProject({ target, tools, dryrun, siteFolder }) {
    if (!tools.yarn && !tools.npm) {
        return "neither yarn nor npm available";
    }
    function toCommandLine(script, ...argv) {
        return tools.yarn ? {
            exe: "yarn",
            argv: [script].concat(argv)
        } : {
            exe: "npm",
            argv: ["run", script].concat(argv)
        };
    }
    const onData = true, onError = true;
    const installRes = await utils.captureProcessOutput({
        cwd: path_1.default.resolve(target, "yaspp"), onData, onError, dryrun, onProgress: true,
        ...toCommandLine("install")
    });
    if (installRes.status) {
        return `Failed to run yarn/npm`;
    }
    const initRes = await utils.captureProcessOutput({
        exe: "npx", onData, onError, dryrun,
        cwd: target,
        argv: ["ts-node", "yaspp/scripts/build/init-yaspp", "--project", "."]
    });
    if (initRes.status) {
        return `Failed to run init-yaspp: ${initRes.errors}`;
    }
    return "";
}
async function generateFiles(target, dry) {
    const errors = [];
    const copies = [
        { tmpl: "gitignore", path: ".gitignore" },
        { tmpl: "package.json", path: "package.json" },
        { tmpl: YASPP_CONFIG, path: YASPP_CONFIG },
    ];
    for await (const { path, tmpl } of copies) {
        const filePath = path_1.default.resolve(target, path);
        if (!await utils.isFileOrFolder(filePath)) {
            const tmplData = await utils.getTemplate(tmpl);
            if (!tmplData) {
                errors.push(`Can't find ${path} template`);
            }
            else {
                console.log(`Generating ${path}`);
                if (!dry) {
                    if (!await utils.writeFile(filePath, tmplData)) {
                        errors.push(`Failed to save ${path}`);
                    }
                }
            }
        }
    }
    return errors.join('\n');
}
async function verifyTarget(target, { dryrun = false }) {
    if (!dryrun) {
        if (await utils.mkdir(target)) {
            return `Failed to find or create target folder ${target}`;
        }
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
function validateSiteConfig(config) {
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
    };
    if (config.assets?.root) {
        Object.assign(ret, { assets: { root: config.assets.root } });
    }
    if (config.style?.root) {
        Object.assign(ret, { style: { root: config.style.root, sheets: config.style.sheets } });
    }
    return ret;
}
async function loadConfigFromProject(sitePath, autoReply) {
    const configPath = path_1.default.resolve(sitePath, YASPP_CONFIG);
    const rawConfig = await utils.readJSON(configPath);
    const siteConfig = validateSiteConfig(rawConfig);
    if (siteConfig && !autoReply) {
        const useIt = await utils.confirm(t("prompt_site_config"), true);
        if (!useIt) {
            return null;
        }
    }
    return siteConfig;
}
async function main(args) {
    const { dryrun: dry = false, version, help, branch = "master" } = args;
    // console.log("create yaspp", args);
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
        console.log(t("dry_run"));
    }
    const tools = await loadTools();
    if (!tools.git || !tools.yarn) {
        return t("err_tools");
    }
    const target = path_1.default.resolve(PROJECT_ROOT, args.target || ".");
    const targetErr = await verifyTarget(target, args);
    if (targetErr) {
        return targetErr;
    }
    // const siteConfigResult = await getContentConfiguration(options || rest, autoReply || refresh);
    const siteRes = await copyDefaultSite(target, dry);
    if (siteRes.error) {
        return siteRes.error;
    }
    const sitePath = siteRes.result;
    const yspErr = await cloneYaspp(target, branch, dry);
    if (yspErr) {
        return yspErr;
    }
    const gErr = await generateFiles(target, dry);
    if (gErr) {
        return `Failed to generate files: ${gErr}`;
    }
    const fErr = await finalizeProject({
        target, tools, dryrun: dry === true, siteFolder: sitePath
    });
    if (fErr) {
        console.error(`Project created by running yassp failed: ${fErr}`);
    }
    if (!dry) {
        utils.exploreToFile(target);
    }
    return "";
}
const WIN_DEVICE_RE = /^([A-Z]):[\\\/]+/i; // eslint-disable-line no-useless-escape
const GIT_URL_RE = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/;
class CYSUtils {
    constructor() {
        this._dictionary = new Map();
    }
    isGitUrl(url) {
        return GIT_URL_RE.test(url ?? "");
    }
    async getTemplate(name) {
        const tmplPath = path_1.default.resolve(CSY_ROOT, "data/templates", `${name}.tmpl`);
        const e = await this.readFile(tmplPath);
        return e || "";
    }
    normalizePath(path) {
        if (!path) {
            return "";
        }
        const match = WIN_DEVICE_RE.exec(path);
        let ret = "";
        if (match) {
            const drive = `/${match[1].toLowerCase()}/`;
            ret = path.replace(WIN_DEVICE_RE, drive);
        }
        return ret.replace(/\\/g, '/');
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
    async cloneRepository({ url, dry, branch, folderName, parentFolder }) {
        const repoName = url.replace(/^.+\/([^\.]+)\.git\s*$/, "$1");
        const sitePath = path_1.default.resolve(parentFolder, folderName || repoName);
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
    diffPaths(fromPath, toPath) {
        const fromParts = fromPath.split(/[\/\\]+/), toParts = toPath.split(/[\/\\]+/);
        let rest = "";
        const retParts = [];
        for (let ind = 0, len = fromParts.length, toLen = toParts.length; ind < len; ++ind) {
            if (retParts.length || ind >= toLen) {
                retParts.push("..");
            }
            else if (fromParts[ind].toLowerCase() !== toParts[ind].toLowerCase()) {
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
    async captureProcessOutput({ cwd, exe, argv, env, onData, onError, dryrun, quiet, onProgress }) {
        const errCB = (onError === true) ?
            (s) => !quiet && console.warn(`>${s}`) : onError;
        const dataCB = (onData === true) ?
            (s) => !quiet && console.log(`>${s}`) : onData;
        const progress = typeof onProgress === "function" ? {
            callback: onProgress,
            cleanup: () => void 0,
            interval: null
        } :
            onProgress === true ? {
                callback: () => process.stdout.write('.'),
                cleanup: () => console.log('done'),
                interval: null
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
            };
        }
        return new Promise((resolve) => {
            const output = [];
            const errors = [];
            let resolved = false;
            function resolveWith(status, err) {
                if (!resolved) {
                    resolved = true;
                    resolve({
                        status,
                        errors: [err, ...errors].filter(Boolean),
                        output
                    });
                }
            }
            try {
                const processEnv = env ? {
                    ...process.env, ...env
                } : undefined;
                const proc = (0, child_process_1.spawn)(exe, argv, {
                    shell: true,
                    cwd: cwd || process.cwd(),
                    env: processEnv
                });
                if (progress) {
                    progress.interval = setInterval(progress.callback, 100);
                }
                proc.on("error", err => {
                    resolveWith(2, String(err));
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
                    resolveWith(proc.exitCode);
                });
            }
            catch (e) {
                resolveWith(3, String(e));
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
                    clearInterval(progress.interval);
                    progress.interval = null;
                }
                progress.cleanup();
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
     * Returns a path suitable for quick display, last 3 components
     * @param path
     * @returns
     */
    trimPath(path) {
        const parts = path.split(/[\/\\]+/);
        return parts.slice(Math.max(0, parts.length - 3)).join('/');
    }
    /**
     * Swallows errors
     * @param options.mustExist If true, return an error if the folder doesn't exist, otherwise return success
     * @returns
     */
    async removeFolder({ path, removeRoot, mustExist = false, progress }) {
        if (!await this.isFolder(path)) {
            return !mustExist;
        }
        let interval = progress ? setInterval(() => process.stdout.write('.')) : null;
        const removePath = removeRoot ? path : `${path}/*`;
        if (interval) {
            process.stdout.write(`Deleting ${removePath}`);
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
    async isEmpty(folder, mustExist) {
        if (!await this.isFolder(folder)) {
            return mustExist ? errorResult(`Folder $`) : successResult(true);
        }
        try {
            const files = await fs_1.promises.readdir(folder, { withFileTypes: true });
            for await (const d of files) {
                if (d.name === "." || d.name === "..") {
                    continue;
                }
                if (d.isDirectory()) {
                    const emptyRes = await this.isEmpty(path_1.default.resolve(folder, d.name), mustExist);
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
                    return successResult(false);
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
    exploreToFile(path) {
        let cmd = ``;
        switch (os_1.default.platform().toLowerCase().replace(/[0-9]/g, ``).replace(`darwin`, `macos`)) {
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
            (0, child_process_1.spawn)(cmd, [path]);
            return true;
        }
        catch (e) {
            return false;
        }
    }
}
const utils = new CYSUtils();
const unknownArgs = [];
const args = (0, minimist_1.default)(process.argv.slice(2), {
    alias: {
        D: "dryrun",
        V: "version",
        T: "target",
        B: "branch",
        "autoReply": "auto",
        // defaultLocale: "default-locale",
        // contentRoot: "content-root",
        // contentIndex: "content-index",
        // localeRoot: "locale-root",
        // assetsRoot: "assets-root",
        // styleRoot: "style-root",
        // styleSheets: "style-sheets",
    },
    "boolean": ["version", "dryrun", "help", "auto"],
    "default": { target: ".", dryrun: false, "auto": false },
    "string": ["target", "branch"],
    "unknown": (s) => {
        const isArg = s.charAt(0) === "-";
        if (isArg) {
            unknownArgs.push(s);
        }
        return false;
    }
});
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
    });
})
    .catch(err => {
    exit(String(err));
});
//# sourceMappingURL=create-yaspp.js.map