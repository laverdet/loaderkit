import type { Task } from "@braidai/lang/task/utility";
import * as fsS from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";

/** @internal */
export interface FileSystemTask {
	readonly directoryExists: (path: URL) => Task<boolean>;
	readonly fileExists: (path: URL) => Task<boolean>;
	readonly readFileJSON: (path: URL) => Task<unknown>;
	readonly readLink: (path: URL) => Task<string | undefined>;
}

export interface FileSystemAsync {
	readonly directoryExists: (path: URL) => Promise<boolean>;
	readonly fileExists: (path: URL) => Promise<boolean>;
	readonly readFileJSON: (path: URL) => Promise<unknown>;
	readonly readFileString?: (path: URL) => Promise<string>;
	readonly readLink: (path: URL) => Promise<string | undefined>;
}

export interface FileSystemSync {
	readonly directoryExists: (path: URL) => boolean;
	readonly fileExists: (path: URL) => boolean;
	readonly readFileJSON: (path: URL) => unknown;
	readonly readFileString?: (path: URL) => string;
	readonly readLink: (path: URL) => string | undefined;
}

// From my limited testing on Windows, `fs.readlink` returns a full path to 'C:\whatever'. So
// flipping the slashes and prefixing the fake root path is enough to get my sample pnpm project
// working correctly.
const normalizeWindowsLink = function(): (path: string) => string {
	if (os.platform() === "win32") {
		return path => `/${path.replaceAll("\\", "/")}`;
	} else {
		return path => path;
	}
}();

export const defaultAsyncFileSystem: FileSystemAsync = {
	directoryExists: async path => {
		try {
			const stat = await fs.stat(path);
			return stat.isDirectory();
		} catch {
			return false;
		}
	},

	fileExists: async path => {
		try {
			const stat = await fs.stat(path);
			return stat.isFile();
		} catch {
			return false;
		}
	},

	readFileJSON: async (path): Promise<unknown> => JSON.parse(await fs.readFile(path, "utf8")),

	readLink: async path => {
		try {
			return normalizeWindowsLink(await fs.readlink(path));
		} catch {
			return undefined;
		}
	},
};

export const defaultSyncFileSystem: FileSystemSync = {
	directoryExists: path => {
		try {
			const stat = fsS.statSync(path);
			return stat.isDirectory();
		} catch {
			return false;
		}
	},

	fileExists: path => {
		try {
			const stat = fsS.statSync(path);
			return stat.isFile();
		} catch {
			return false;
		}
	},

	readFileJSON: (path): unknown => JSON.parse(fsS.readFileSync(path, "utf8")),

	readLink: path => {
		try {
			return normalizeWindowsLink(fsS.readlinkSync(path));
		} catch {
			return undefined;
		}
	},
};
