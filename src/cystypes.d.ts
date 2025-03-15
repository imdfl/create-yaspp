export type Nullable<T extends object> = T | null;
export type ErrorMessage = string;

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
  };

export interface ICYSPOptions {
    readonly branch: string;
	readonly target: string;
	readonly install: boolean;
}
export interface ICYSPArgv extends Partial<ICYSPOptions> {
	readonly dryrun: boolean;
	readonly help: boolean;
	readonly version: boolean;
	readonly autoReply: boolean;
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
