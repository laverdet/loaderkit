[![npm version](https://badgen.now.sh/npm/v/@loaderkit/resolve)](https://www.npmjs.com/package/@loaderkit/resolve)
[![isc license](https://badgen.now.sh/npm/license/@loaderkit/resolve)](https://github.com/braidnetworks/loaderkit/blob/main/LICENSE)
[![github action](https://github.com/braidnetworks/loaderkit/actions/workflows/build.yaml/badge.svg)](https://github.com/braidnetworks/loaderkit/actions/workflows/build.yaml)
[![npm downloads](https://badgen.now.sh/npm/dm/@loaderkit/resolve)](https://www.npmjs.com/package/@loaderkit/resolve)

🔎 @loaderkit/resolve - General purpose nodejs module resolver
==============================================================

An accurate & abstract implementation of the nodejs module resolution algorithms. It implements both
the [CommonJS](https://nodejs.org/api/modules.html#all-together) and
[modules](https://nodejs.org/api/esm.html#resolution-and-loading-algorithm) algorithms. Originally
authored for [arethetypeswrong](https://arethetypeswrong.github.io).

See also: [resolve](https://www.npmjs.com/package/resolve),
[enhanced-resolve](https://github.com/webpack/enhanced-resolve), and
[esm-resolve](https://www.npmjs.com/package/esm-resolve). The main point of this package is accuracy
with the default nodejs resolution algorithms.

- **Does nothing that the nodejs default resolver doesn't do**
- Runs in a web browser w/ abstract filesystems
- Sensible TypeScript-first types
- Shakeable ESM exports
- Promise & synchronous implementations

## Usage
```ts
import { resolve, resolveSync } from '@loaderkit/resolve/esm';
import { resolve as resolveRequire, resolveSync as resolveRequireSync } from '@loaderkit/resolve/cjs';
import { defaultAsyncFileSystem, defaultSyncFileSystem } from '@loaderkit/resolve/fs';

// Async module resolution
const resolution = await resolve(defaultAsyncFileSystem, 'react', new URL(import.meta.url));
console.log(resolution.format, resolution.url);
// format: "addon" | "builtin" | "commonjs" | "json" | "module" | "wasm"
// url: typeof URL

// Synchronous module resolution
resolveSync(defaultSyncFileSystem, 'react', new URL(import.meta.url));

// CommonJS module resolution
await resolveRequire(defaultAsyncFileSystem, 'lodash', new URL(import.meta.url));
resolveRequireSync(defaultSyncFileSystem, 'lodash', new URL(import.meta.url));
```

The `FileSystemAsync` and `FileSystemSync` interfaces can be implemented by client code as
necessary. For example, you could write a delegate to load the module source files from a zip file,
from the internet, or whatever you want.
