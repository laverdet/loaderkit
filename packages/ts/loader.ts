import type { LoaderFileSystem } from "./utility/scope.js";
import * as fs from "node:fs";
import { defaultSyncFileSystem } from "@loaderkit/resolve/fs";
import { makeResolveAndLoad } from "./esm.js";

const fileSystem: LoaderFileSystem = {
	...defaultSyncFileSystem,
	readFileString: path => fs.readFileSync(path, "utf8"),
};

/** @internal */
export const { load, resolve } = makeResolveAndLoad(fileSystem);
