// Test setup — provide the browser globals our pure modules expect at runtime.
//
// `share-codec.js` calls `pako.deflateRaw` / `pako.inflateRaw`, which in the
// browser come from a global <script> (assets/vendor/pako.min.js). We load that
// EXACT vendored build here so encoded output matches production byte-for-byte
// (important — the golden vectors below are tied to pako 2.1.0).
//
// `btoa` / `atob` / `TextEncoder` are already Node globals, so no shimming
// needed for those. `joint` is NOT referenced by any pure module under test, so
// it is intentionally not stubbed here; add it the day a JointJS-touching module
// gets a test.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pakoSrc = readFileSync(new URL('../assets/vendor/pako.min.js', import.meta.url), 'utf8');

// pako's UMD wrapper attaches to `globalThis` when neither CommonJS (exports/
// module) nor AMD (define) is present. `runInThisContext` executes the script in
// Node's real global scope (no CJS wrapper), so the UMD takes that branch and
// sets `globalThis.pako` — which is the same object as `global.pako`.
vm.runInThisContext(pakoSrc);

if (typeof globalThis.pako?.deflateRaw !== 'function' ||
    typeof globalThis.pako?.inflateRaw !== 'function') {
  throw new Error('Test setup: vendored pako failed to expose deflateRaw/inflateRaw on global scope');
}
