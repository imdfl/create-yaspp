export type Nullable<T extends object> = T | null;
export type ErrorMessage = string;

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
  };

export interface ICSYPSiteOptions {
	readonly site: string;
    readonly branch: string;
	readonly clean: boolean;
}

export interface ICYSPOptions extends ICSYPSiteOptions{
	readonly target: string;
    readonly contentRoot: string;
    readonly contentIndex: string;
    readonly localeRoot: string;
    readonly styleRoot?: string;
    readonly styleIndex?: string;
    readonly assetsRoot?: string;
    readonly langs?: string;
    readonly defaultLocale?: string;
}


export interface ICYSPArgv extends Partial<ICYSPOptions> {
	readonly dryrun: boolean;
	readonly help: boolean;
	readonly version: boolean;
	readonly config: string;
	readonly autoReply: boolean;
	readonly refresh: boolean;
	readonly content: boolean;
}

export interface ICloneOptions {
	readonly url: string;
	readonly folderName?: string;
	readonly branch?: string;
	readonly dry?: boolean;
	/**
	 * Full path
	 */
	readonly parentFolder: string;
}

export interface IResponse<T> {
	readonly result?: T;
	readonly error?: string;
}

export type FileType = "" | "file"| "folder" | "other";

export interface IRemoveFolderOptions {
	readonly path: string;
	readonly removeRoot: boolean;
	/**
	 * If true, return an error if the folder does not  exist
	 */
	readonly mustExist?: boolean;
	readonly progress?: boolean;
}


export interface IProcessOutput {
	readonly output: ReadonlyArray<string>;
	readonly errors: ReadonlyArray<string>;
	readonly status: number;
}

export interface IMutableProcessOptions {
	/**
	 * command name as typed in console
	 */
	exe: string;
	/**
	 * arguments
	 */
	argv: string[];


	env?: {[key: string]: string };
	/**
	 * Optional working directory
	 */
	cwd?: string;

    /**
     * If true, log the data, if a function call it on every stdin data
     */
	onData?: ((data: string) => void) | boolean;

    /**
     * If true, log the error, if a function call it on every stderr data
     */
	onError?: ((data: string) => void) | boolean;

	/**
	 * If true, only log the command to console
	 */
	dryrun?: boolean;
	/**
	 * Suppress output
	 */
	quiet?: boolean;

	onProgress?: (() => unknown) | boolean;
}

export type IProcessOptions = Readonly<IMutableProcessOptions>;
