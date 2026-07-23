import type { LoaderFileSystem } from "#ts/utility/scope";
import type { LoadFnOutput, LoadHookContext, ResolveFnOutput, ResolveHookContext } from "node:module";
import * as assert from "node:assert/strict";
import { SourceTextModule, createContext } from "node:vm";
import { makeTestFileSystem } from "@loaderkit/resolve/adapter";
import { resolveSync as esmResolve } from "@loaderkit/resolve/esm";
import { makeResolveAndLoad } from "#ts/esm";

/** @internal */
export function makeTestLoader(files: Record<string, string>) {
	const fs = makeTestFileSystem(files) as LoaderFileSystem;
	const loader = makeResolveAndLoad(fs);
	const resolve = (specifier: string, parentURL: string | undefined) => {
		const resolveContext: ResolveHookContext = {
			conditions: [ "node" ],
			importAttributes: {},
			parentURL,
		};
		const nextResolve = (specifier: string, context?: Partial<ResolveHookContext>): ResolveFnOutput => {
			assert.ok(context?.parentURL !== undefined);
			const result = esmResolve(fs, specifier, new URL(context.parentURL));
			assert.ok(result.format !== "addon");
			return {
				url: result.url.href,
				format: result.format,
				importAttributes: {},
				shortCircuit: true,
			};
		};
		const resolveResult = loader.resolve(specifier, resolveContext, nextResolve);
		assert.ok(resolveResult.shortCircuit);
		return resolveResult;
	};
	const load = (resolution: ResolveFnOutput) => {
		const loadContext: LoadHookContext = {
			conditions: [ "node" ],
			importAttributes: resolution.importAttributes ?? {},
			format: resolution.format,
		};
		const nextLoad = (urlString: string, context?: Partial<LoadHookContext>): LoadFnOutput => {
			const content = fs.readFileString(new URL(urlString));
			assert.strictEqual(context?.format, "module");
			return {
				format: "module",
				shortCircuit: true,
				source: content,
			};
		};
		const loadResult = loader.load(resolution.url, loadContext, nextLoad);
		assert.ok(loadResult.shortCircuit);
		return loadResult;
	};
	const evaluate = async (main: string) => {
		const context = createContext();
		const cache = new Map<string, SourceTextModule>();
		const mainResolution = resolve(`file:///${main}`, undefined);
		const sourceText = load(mainResolution);
		const entry = new SourceTextModule(sourceText.source as string, {
			context,
			identifier: mainResolution.url,
			initializeImportMeta: meta => {
				meta.url = mainResolution.url;
			},
		});
		cache.set(mainResolution.url, entry);
		const get = (resolution: ResolveFnOutput) => cache.get(resolution.url) ?? function() {
			const loadResult = load(resolution);
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			const module = new SourceTextModule(String(loadResult.source), {
				context,
				identifier: resolution.url,
				initializeImportMeta: meta => {
					meta.url = resolution.url;
				},
			});
			cache.set(resolution.url, module);
			return module;
		}();
		// eslint-disable-next-line @typescript-eslint/require-await
		await entry.link(async (specifier, referencingModule) => get(resolve(specifier, referencingModule.identifier)));
		await entry.evaluate();
		return context as Record<string, unknown>;
	};
	return { evaluate, resolve };
}
