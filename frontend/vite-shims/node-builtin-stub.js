/**
 * Vite/Rollup resolve target for Node `path` / `fs` imports pulled in by some Emscripten
 * bundles (e.g. curve25519). Browser builds do not execute those code paths; the real
 * modules are not available in the client bundle.
 */
export default {};
