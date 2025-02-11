"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const minimist_1 = __importDefault(require("minimist"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const ROOT_FOLDER = path_1.default.resolve(__dirname, "..");
const YASPP_REPO_URL = "git@github.com:imdfl/yaspp.git";
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
async function getVersion() {
    try {
        const path = path_1.default.join(ROOT_FOLDER, "package.json");
        const pdata = await fs_1.promises.readFile(path, "utf-8");
        const pkg = JSON.parse(pdata);
        return pkg.version ? successResult(pkg.version) : errorResult("version not found");
    }
    catch (err) {
        return errorResult(`Error retrieving version from package.json: ${err}`);
    }
}
function exit(err) {
    if (err) {
        console.error(err);
    }
    process.exit(err ? 1 : 0);
}
function printHelp() {
    console.log(`Usage: create-yassp
	--dry/-D: dry run
	--help: Print this help message
	--repository/-R <url>: the full URL of the content repository to clone
	--path/-P <path>: The file system path of the content to copy\n`);
}
async function copyContent(path, dry) {
    const fullPath = path_1.default.resolve(ROOT_FOLDER, path);
    try {
        const l = await fs_1.promises.lstat(fullPath);
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
async function cloneContent(url, dry) {
    console.log(`Trying to clone ${url}`);
    if (dry) {
        return successResult("");
    }
    return successResult("");
}
async function generateYaspp(dry) {
    const yPath = path_1.default.resolve(ROOT_FOLDER, "yaspp.json");
    console.log(`generating yassp.json (${yPath}`);
    if (dry) {
        return successResult(yPath);
    }
    try {
        const y = {
            content: {
                root: "..",
            },
            locale: {
                langs: ["en"]
            }
        };
        await fs_1.promises.writeFile(yPath, JSON.stringify(y));
        return successResult(yPath);
    }
    catch (err) {
        return errorResult(`Error generating yaspp.json: ${err}`);
    }
}
async function main(args) {
    const { dry, path, repository } = args;
    // console.log("create yaspp", args);
    if (args.help) {
        printHelp();
        exit();
    }
    ;
    if (args.version) {
        const ver = await getVersion();
        console.log(`create yaspp version ${ver}`);
        exit();
    }
    if (dry) {
        console.log(`yaspp dry run`);
    }
    let contentPath = "";
    if (path) {
        if (args.repository) {
            return "Cannot specify both repository and path";
        }
        const copyRes = await copyContent(path, args.dry);
        if (copyRes.error) {
            return copyRes.error;
        }
        contentPath = copyRes.result;
    }
    else if (repository) {
        const cloneRes = await copyContent(repository, args.dry);
        if (cloneRes.error) {
            return cloneRes.error;
        }
        contentPath = cloneRes.result;
    }
    const yRes = await cloneContent(YASPP_REPO_URL);
    if (yRes.error) {
        return `Clone error: ${yRes.error}`;
    }
    const genRes = await generateYaspp(dry);
    return genRes.error ?? "";
}
const unknownArgs = [];
const args = (0, minimist_1.default)(process.argv.slice(2), {
    alias: {
        R: "repository",
        P: "path",
        D: "dry"
    },
    "boolean": ["version", "dry", "help"],
    "default": { dry: false },
    "string": ["repository", "path"],
    "unknown": (s) => {
        const isArg = s.charAt(0) === "-";
        if (isArg) {
            unknownArgs.push(s);
        }
        return false;
    }
});
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
//# sourceMappingURL=create-yaspp.js.map