/**
 * Node.js-compatible entry point for @alkanes/ts-sdk/wasm.
 * Loads the WASM binary via fs.readFileSync instead of import, bypassing
 * vite-plugin-wasm which creates invalid paths on Windows in vitest.
 *
 * Used by vitest.config.ts alias: @alkanes/ts-sdk/wasm → this file
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load WASM binary synchronously
const wasmPath = resolve(__dirname, 'alkanes_web_sys_bg.wasm');
const wasmBytes = readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);

// Re-export all bindings from the JS glue
export * from './alkanes_web_sys_bg.js';
import { __wbg_set_wasm } from './alkanes_web_sys_bg.js';

// Initialize WASM instance with glue imports
import * as bg from './alkanes_web_sys_bg.js';
const imports = { './alkanes_web_sys_bg.js': bg };
const instance = new WebAssembly.Instance(wasmModule, imports);
__wbg_set_wasm(instance.exports);
instance.exports.__wbindgen_start();
