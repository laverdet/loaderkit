[![npm version](https://badgen.now.sh/npm/v/@loaderkit/ts)](https://www.npmjs.com/package/@loaderkit/ts)
[![isc license](https://badgen.now.sh/npm/license/@loaderkit/ts)](https://github.com/braidnetworks/loaderkit/blob/main/LICENSE)
[![github action](https://github.com/braidnetworks/loaderkit/actions/workflows/build.yaml/badge.svg)](https://github.com/braidnetworks/loaderkit/actions/workflows/build.yaml)
[![npm downloads](https://badgen.now.sh/npm/dm/@loaderkit/ts)](https://www.npmjs.com/package/@loaderkit/ts)

🐘 @loaderkit/ts - A nodejs loader for TypeScript
=================================================

This is a simple loader for well-configured TypeScript projects running in nodejs.

The difference between this loader and the built-in TypeScript loader for nodejs and
[tsx](https://www.npmjs.com/package/tsx) is that this loader is meant for projects which intend to
eventually deploy as stripped JavaScript.

nodejs doesn't include a TypeScript-aware resolver, so `import {} from "./module.js";` will not load
if `module.js` is actually `module.ts`. This of course causes problems for your source when you
eventually do output to JavaScript. nodejs also only supports [erasable
syntax](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly) which is fine, but if you have
extended TypeScript syntax you need a different loader. This loader detects projects using
[`erasableSyntaxOnly`](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly) and will
delegate to the built-in nodejs TypeScript loader for those files. For other files, esbuild is used.
In either case the custom resolver is used which handles `.js` extensions and correct "dist" to
"src" mapping.

`tsx` [doesn't respect `import.meta.url`](https://github.com/privatenumber/tsx/issues/448) which is
a fine opinion to take. It also struggles with various TypeScript [directory configuration
directives](https://github.com/privatenumber/tsx/issues/714). These factors make eventual
distribution of JavaScript projects difficult to accomplish.

An extra degree of care has been taken to ensure that `import.meta.url` is correct. My belief is
that the behavior of your program should not be different between development and production
versions. And I don't think that this should be controversial either. So, when an output destination
is specified in the nearest `tsconfig.json` then `import.meta.url` will be the value it would have
been if run from the `tsc`-transpiled output.

---

This loader does not perform any type checking. It only performs transpilation. A well-configured
project should run `tsc -b -w` in a separate process.

This loader should only be used in projects which use ECMAScript modules. A well-configured project
should not be using CommonJS.

Source maps are passed along in the transpilation process, so the `--enable-source-maps` nodejs flag
is recommended.


EXAMPLE
-------

`main.ts`
```ts
const value: string = 'hello world';
console.log(value);
```

```
$ node --import @loaderkit/ts test.ts
hello world
```
