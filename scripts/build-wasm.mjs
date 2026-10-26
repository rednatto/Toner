// Build the Rust DSP crate to WebAssembly and copy it into the web app's public folder.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(root, 'crates', 'dsp');
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: crate, stdio: 'inherit' });
const built = join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'toner_dsp.wasm');
const dest = join(root, 'apps', 'web', 'public', 'dsp.wasm');
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(built, dest);
console.log(`dsp.wasm: ${statSync(dest).size} bytes`);
