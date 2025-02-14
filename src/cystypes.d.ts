export type Nullable<T extends object> = T | null;

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
  };

export interface ICYSPOptions {
	readonly path: string;
	readonly repository: string;
    readonly branch: string;
    readonly contentRoot: string;
    readonly contentIndex: string;
    readonly localeRoot: string;
    readonly styleRoot?: string;
    readonly styleIndex?: string;
    readonly assetsRoot?: string;
    readonly langs?: string;
    readonly defaultLocale?: string;
}

export interface ICloneOptions {
	readonly url: string;
	readonly folderName?: string;
	readonly branch?: string;
	readonly dry?: boolean
}

export interface ICYSPArgv extends Partial<ICYSPOptions> {
	readonly dryrun?: boolean;
	readonly help?: boolean;
	readonly version?: boolean;
	readonly config?: string;
	readonly autoReply?: boolean;
	readonly refresh?: boolean;
	readonly content?: boolean;
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
}


export interface IProcessOutput {
	readonly output: ReadonlyArray<string>;
	readonly error: ReadonlyArray<string>;
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
}

export type IProcessOptions = Readonly<IMutableProcessOptions>;

export interface IProjectLocaleConfig {
	readonly langs: ReadonlyArray<string>;
	readonly defaultLocale: string;
	readonly pages: Record<string, ReadonlyArray<string>>;
}

interface IYasppBaseConfig {
	/**
	 * Relative to project root, all content is copied to `/public`, e.g. `/public/content`, `/public/locales`
	 */
	readonly root: string;
}

export type IYasppLocaleConfig = IProjectLocaleConfig & IYasppBaseConfig;
export interface IYasppContentConfig extends IYasppBaseConfig{
	/**
	 * Mandatory path to index folder relative to the content root folder, e.g. `docs` which is expected to contain
	 * at least a content folder for the default locale, e.g. 'en'
	 */
	readonly index: string;
}

export interface IYasppStyleConfig extends IYasppBaseConfig {
	/**
	 * Optional Path to main css file, relative to the style root , defaults to site.scss (generated if no css is provided by the user)
	 */
	readonly index?: string;
}

export type IYasppAssetsConfig = IYasppBaseConfig;

/**
 * Project configuration file
 */
export interface IYasppConfig {
	readonly content: IYasppContentConfig;
	readonly locale: IYasppLocaleConfig;
	readonly style?: IYasppStyleConfig;
	readonly assets?: IYasppStyleConfig;
}
