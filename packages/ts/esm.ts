import type { LoaderFileSystem, PackageJson, ResolutionConfig } from "./utility/scope.js";
import type { FileSystemSync } from "@loaderkit/resolve/fs";
import type { LoadHookSync, ResolveHookSync } from "node:module";
import type {} from "dynohot";
import { resolveSync as cjsResolve } from "@loaderkit/resolve/cjs";
import { resolveSync as esmResolve } from "@loaderkit/resolve/esm";
import { transpileSource } from "./utility/esbuild.js";
import { makeResolveTypeScriptPackage, resolveFormat, resolvePackage } from "./utility/scope.js";
import { absoluteJavaScriptToTypeScript, absoluteTypeScriptToJavaScript, outputToSourceCandidates, sourceToOutput, testAnyJSON, testAnyJavaScript, testAnyScript, testAnyTypeScript } from "./utility/translate.js";

const testHasScheme = /^[a-z][a-z0-9+.-]*:/i;
const commonJsExtensions = [ ".js", ".jsx" ];
const commonJsImportConditions = [ "node", "import", "require" ];
const commonJsRequireConditions = [ "node", "require" ];

/**
 * These hooks are installed in-thread, which means they also observe `require()`. This loader only
 * handles ECMAScript modules, so those requests are forwarded along untouched. nodejs always
 * includes exactly one of "import" or "require" in the default condition set.
 */
const isRequire = (conditions: readonly string[]) =>
	conditions.includes("require") && !conditions.includes("import");

/** @internal */
export function makeResolveAndLoad(underlyingFileSystem: LoaderFileSystem) {
	// Cache `package.json` reads
	const fileSystem = {
		...underlyingFileSystem,
		readFileJSON: function(readFileJSON) {
			const cache = new Map<string, unknown>();
			return (url: URL) => {
				if (cache.has(url.href)) {
					return cache.get(url.href);
				}
				const result = readFileJSON(url);
				cache.set(url.href, result);
				return result;
			};
		}(underlyingFileSystem.readFileJSON),
	};

	// tsconfig.resolver utilities
	const resolvedTypeScriptParents = new Map<string, URL>();
	const resolveTypeScriptPackage = makeResolveTypeScriptPackage(fileSystem);
	const resolveTsConfig = (url: URL) => {
		const packageMeta = resolvePackage(fileSystem, url);
		return resolveTypeScriptPackage(url, packageMeta?.packagePath);
	};

	// Resolves from .ts source files to another source file. Used for relative imports.
	const sourceResolverFileSystem = function(): FileSystemSync {
		const findSource = (url: URL) => {
			// First try .js -> .ts map since this is the most likely case
			if (testAnyJavaScript.test(url.pathname)) {
				const asTs = absoluteJavaScriptToTypeScript(url);
				if (fileSystem.fileExists(asTs)) {
					return asTs;
				}
			}
			// Try file as is
			if (fileSystem.fileExists(url)) {
				return url;
			}
		};
		return {
			...fileSystem,
			fileExists: url => {
				if (testAnyScript.test(url.pathname)) {
					return findSource(url) ? true : false;
				} else {
					return fileSystem.fileExists(url);
				}
			},
			readLink: url => {
				if (testAnyScript.test(url.pathname)) {
					const source = findSource(url);
					if (source) {
						if (source.href === url.href) {
							return fileSystem.readLink(url);
						} else {
							return source.pathname;
						}
					}
				}
				return fileSystem.readLink(url);
			},
		};
	}();

	// Resolves to output .js files. Used for fully qualified imports.
	const outputResolverFileSystem: FileSystemSync = {
		...fileSystem,
		fileExists: url => {
			if (
				testAnyScript.test(url.pathname) ||
				(testAnyJSON.test(url.pathname) && !url.pathname.endsWith("/package.json"))
			) {
				const tsConfig = resolveTsConfig(url);
				for (const location of outputToSourceCandidates(url, tsConfig?.locations)) {
					if (fileSystem.fileExists(location)) {
						return true;
					}
				}
				return false;
			} else {
				return fileSystem.fileExists(url);
			}
		},
		readLink: url => {
			if (!testAnyScript.test(url.pathname) && !testAnyJSON.test(url.pathname)) {
				return fileSystem.readLink(url);
			}
		},
	};

	const makeResolver = (fileSystem: FileSystemSync, packageJson: PackageJson | undefined, locations: ResolutionConfig | undefined) =>
		(specifier: string, parentURL: URL) => {
			const parentFormat = resolveFormat(parentURL.pathname, packageJson);
			if (locations?.outputBase) {
				// Projects with outputs use a stricter resolution
				if (parentFormat === "module") {
					return esmResolve(fileSystem, specifier, parentURL);
				} else {
					return cjsResolve(fileSystem, specifier, parentURL);
				}
			} else {
				// Projects without outputs fall back to CJS resolution with custom conditions &
				// extensions. This simulates "bundler" like behavior.
				return cjsResolve(fileSystem, specifier, parentURL, {
					conditions: parentFormat === "module"
						? commonJsImportConditions
						: commonJsRequireConditions,
					extensions: commonJsExtensions,
				});
			}
		};

	const resolve: ResolveHookSync = (specifier, context, nextResolve) => {
		if (isRequire(context.conditions)) {
			return nextResolve(specifier, context);
		}
		const { parentURL: parentUrlString } = context;
		if (parentUrlString === undefined) {
			// Program entrypoint. We can assume that `specifier` is a fully-resolved file URL with
			// no query parameters. It could be either a source file or an output file.
			const url = new URL(specifier);
			const packageMeta = resolvePackage(fileSystem, url);
			const tsConfig = resolveTypeScriptPackage(url, packageMeta?.packagePath);
			const format = resolveFormat(specifier, packageMeta?.packageJson);
			const outputUrl = sourceToOutput(url, tsConfig?.locations);
			if (outputUrl) {
				// `node main.ts`
				resolvedTypeScriptParents.set(outputUrl.href, url);
				return {
					url: outputUrl.href,
					format,
					importAttributes: context.importAttributes,
					shortCircuit: true,
				};
			} else {
				for (const sourceUrl of outputToSourceCandidates(url, tsConfig?.locations)) {
					if (fileSystem.fileExists(sourceUrl)) {
						// `node dist/main.js`
						resolvedTypeScriptParents.set(url.href, sourceUrl);
						return {
							url: url.href,
							format,
							importAttributes: context.importAttributes,
							shortCircuit: true,
						};
					}
				}
				return nextResolve(specifier, context);
			}
		}

		// Bail early on relative imports from unknown parents
		// nb: Imports from `--import` on the command line use the cwd (ending in a slash) as the
		// parent
		const parentURL = new URL(parentUrlString);
		const sourceParentURL = resolvedTypeScriptParents.get(parentUrlString);
		if (!sourceParentURL && specifier.startsWith(".") && !parentUrlString.endsWith("/")) {
			return nextResolve(specifier, context);
		}

		// Check for fully-resolved .ts files, i.e. `import(import.meta.resolve('./specifier.js'))`
		if (
			specifier.startsWith("file:///") &&
			!specifier.includes("/node_modules/")
		) {
			const outputUrl = new URL(specifier);
			const packageMeta = resolvePackage(fileSystem, outputUrl);
			const tsConfig = resolveTypeScriptPackage(outputUrl, packageMeta?.packagePath);
			const sourceUrl = function() {
				for (const url of outputToSourceCandidates(outputUrl, tsConfig?.locations)) {
					if (fileSystem.fileExists(url)) {
						return url;
					}
				}
			}();
			if (!sourceUrl) {
				return nextResolve(specifier, context);
			}
			const format = resolveFormat(sourceUrl.pathname, packageMeta?.packageJson);
			resolvedTypeScriptParents.set(outputUrl.href, sourceUrl);
			return {
				format,
				url: outputUrl.href,
				importAttributes: context.importAttributes,
				shortCircuit: true,
			};
		}

		// Bail on fully-qualified URLs
		if (testHasScheme.test(specifier)) {
			return nextResolve(specifier, context);
		}

		// Try as TypeScript resolution

		// Look up parent tsconfig
		const packageMeta = resolvePackage(fileSystem, parentURL);
		const tsConfig = resolveTypeScriptPackage(parentURL, packageMeta?.packagePath);

		// Dispatch custom resolution
		const result = function() {
			try {
				if (specifier.startsWith(".")) {
					// Relative imports will use a resolver which returns the source file URL. It
					// must then be mapped to an output file.
					const resolve = makeResolver(sourceResolverFileSystem, packageMeta?.packageJson, tsConfig?.locations);
					const resolutionParentURL = sourceParentURL ?? parentURL;
					const sourceResolution = resolve(specifier, resolutionParentURL);
					const resolvedTsConfig = resolveTsConfig(resolutionParentURL);
					const outputUrl = sourceToOutput(sourceResolution.url, resolvedTsConfig?.locations);
					return {
						format: sourceResolution.format,
						url: outputUrl ?? absoluteTypeScriptToJavaScript(sourceResolution.url),
						sourceUrl: sourceResolution.url,
					};
				} else {
					// Fully-qualified imports resolve to an output file, which must then be mapped
					// back to source file. We must resolve to an output file fully-qualified
					// specifiers end up digging through `package.json` which will always list
					// output files.
					const resolve = makeResolver(outputResolverFileSystem, packageMeta?.packageJson, tsConfig?.locations);
					const outputResolution = resolve(specifier, parentURL);
					const resolvedTsConfig = resolveTsConfig(outputResolution.url);
					return {
						...outputResolution,
						sourceUrl: function() {
							for (const url of outputToSourceCandidates(outputResolution.url, resolvedTsConfig?.locations)) {
								if (fileSystem.fileExists(url)) {
									return url;
								}
							}
						}(),
					};
				}
			} catch {}
		}();

		// On failure forward to next resolver
		if (!result) {
			return nextResolve(specifier, context);
		}

		// Return successful resolutions which did not resolve to a TypeScript source
		const { format, sourceUrl, url } = result;
		if (
			!sourceUrl ||
			url.protocol !== "file:" ||
			url.pathname.includes("/node_modules/") ||
			(format !== undefined && format !== "module" && format !== "commonjs" && format !== "json")
		) {
			return {
				format: format === "addon" ? undefined : format,
				shortCircuit: true,
				url: url.href,
			};
		}

		// Check for .ts import from non-bundler projects
		if (testAnyTypeScript.test(specifier.replace(/[#?].+/, "")) && tsConfig?.locations.outputBase) {
			throw new Error(`Cannot import TypeScript specifier '${specifier}' with TypeScript output artifacts enabled.`);
		}

		// If a direct `.ts` specifier was resolved (i.e. no outDir), or a .jsx / .tsx file,
		// then format will be null. So that needs to be resolved by us.
		const resolvedFormat = format ?? resolveFormat(sourceUrl.pathname, packageMeta?.packageJson);

		// Pass off to loader
		if (resolvedFormat === "module" || resolvedFormat === "json") {
			resolvedTypeScriptParents.set(url.href, sourceUrl);
		}
		return {
			format: resolvedFormat,
			url: url.href,
			importAttributes: context.importAttributes,
			shortCircuit: true,
		};
	};

	const load: LoadHookSync = (urlString, context, nextLoad) => {
		const { format } = context;
		const tsSourceUrl = isRequire(context.conditions) ? undefined : resolvedTypeScriptParents.get(urlString);
		if (tsSourceUrl === undefined) {
			// Not resolved with this loader
			return nextLoad(urlString, context);
		}

		// `tsSourceUrl` is a `.ts` file, or maybe a `.js` file with `allowJs`, or `.json` file with `allowJson`.

		// dynohot integration
		if (context.hot) {
			context.hot.watch(tsSourceUrl);
		}

		// Resolve compiler options
		const packageMeta = resolvePackage(fileSystem, tsSourceUrl);
		const tsConfig = resolveTypeScriptPackage(tsSourceUrl, packageMeta?.packagePath);

		switch (format) {
			case "module": {
				// Validate attributes
				const [ unsupportedAttribute ] = Object.entries({ ...context.importAttributes });
				if (unsupportedAttribute) {
					const [ key, value ] = unsupportedAttribute;
					throw new TypeError(`Import attribute '${key}' with value '${value}' is not supported`);
				}

				// Get transpiled source. JavaScript is also passed through esbuild in case downleveling
				// is expected.
				const content = fileSystem.readFileString(tsSourceUrl);
				const payload = transpileSource(content, format, tsSourceUrl, tsConfig?.compilerOptions ?? {});
				return {
					format,
					shortCircuit: true,
					source: payload,
				};
			}

			case "json":
				// Pass source URL to JSON loader
				return nextLoad(tsSourceUrl.href, context);

			default:
				throw new Error("@loaderkit/ts: Unexpected format");
		}
	};

	return { load, resolve };
}
