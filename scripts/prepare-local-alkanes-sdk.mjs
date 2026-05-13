import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const sdkDir = path.join(rootDir, 'agent-repos', 'alkanes-rs', 'ts-sdk');
const wasmDir = path.join(sdkDir, 'wasm');
const localWasmDir = path.join(rootDir, 'lib', 'oyl', 'alkanes');
const packageLink = path.join(rootDir, 'node_modules', '@alkanes', 'ts-sdk');
const tempDir = path.join(rootDir, '.tmp', 'alkanes-sdk-build-temp');
const cargoBinDir = path.join(process.env.USERPROFILE ?? '', '.cargo', 'bin');
const rustToolchainBinDir = path.join(
  process.env.USERPROFILE ?? '',
  '.rustup',
  'toolchains',
  '1.86.0-x86_64-pc-windows-msvc',
  'bin',
);
if (cargoBinDir && fs.existsSync(cargoBinDir)) {
  process.env.PATH = `${cargoBinDir}${path.delimiter}${process.env.PATH ?? ''}`;
}
if (fs.existsSync(rustToolchainBinDir)) {
  process.env.PATH = `${rustToolchainBinDir}${path.delimiter}${process.env.PATH ?? ''}`;
}
fs.mkdirSync(tempDir, { recursive: true });
process.env.TMP = tempDir;
process.env.TEMP = tempDir;
process.env.TMPDIR = tempDir;

function fail(message) {
  console.error(`[prepare-local-alkanes-sdk] ${message}`);
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed in ${cwd}`);
  }
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [command], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function localBinExists(command) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return fs.existsSync(path.join(sdkDir, 'node_modules', '.bin', `${command}${suffix}`))
    || fs.existsSync(path.join(rootDir, 'node_modules', '.bin', `${command}${suffix}`));
}

function newestMtime(paths) {
  let newest = 0;
  const visit = (entryPath) => {
    if (!fs.existsSync(entryPath)) return;
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(entryPath)) {
        if (entry === 'target' || entry === 'node_modules' || entry === 'dist' || entry === 'build' || entry === 'wasm') {
          continue;
        }
        visit(path.join(entryPath, entry));
      }
    } else {
      newest = Math.max(newest, stat.mtimeMs);
    }
  };
  for (const p of paths) visit(p);
  return newest;
}

function sdkSourcesAreNewerThanArtifacts() {
  const sourceMtime = newestMtime([
    path.join(sdkDir, 'package.json'),
    path.join(sdkDir, 'tsconfig.json'),
    path.join(sdkDir, 'tsup.config.ts'),
    path.join(sdkDir, 'src'),
    path.join(rootDir, 'agent-repos', 'alkanes-rs', 'Cargo.lock'),
    path.join(rootDir, 'agent-repos', 'alkanes-rs', 'Cargo.toml'),
    path.join(rootDir, 'agent-repos', 'alkanes-rs', 'crates', 'alkanes-cli-common', 'src'),
    path.join(rootDir, 'agent-repos', 'alkanes-rs', 'crates', 'alkanes-web-sys', 'src'),
    path.join(rootDir, 'agent-repos', 'alkanes-rs', 'crates', 'alkanes-web-sys', 'Cargo.toml'),
    path.join(rootDir, 'agent-repos', 'alkanes-rs', 'crates', 'alkanes-cli-common', 'Cargo.toml'),
  ]);
  const artifactMtime = newestMtime([
    path.join(wasmDir, 'alkanes_web_sys_bg.wasm'),
    path.join(wasmDir, 'alkanes_web_sys.js'),
    path.join(sdkDir, 'dist', 'index.js'),
    path.join(sdkDir, 'dist', 'index.mjs'),
    path.join(sdkDir, 'dist', 'cli.js'),
  ]);
  return sourceMtime > artifactMtime;
}

function ensureLocalSdkExists() {
  if (!fs.existsSync(sdkDir)) {
    fail(`Local SDK checkout not found at ${sdkDir}`);
  }
  if (!fs.existsSync(path.join(sdkDir, 'package.json'))) {
    fail(`Local SDK package.json not found at ${sdkDir}`);
  }
}

function ensurePrebuiltArtifactsExist() {
  const required = [
    path.join(sdkDir, 'dist', 'index.js'),
    path.join(sdkDir, 'dist', 'index.mjs'),
    path.join(wasmDir, 'alkanes_web_sys.js'),
    path.join(wasmDir, 'alkanes_web_sys_bg.wasm'),
  ];
  const missing = required.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    fail(`Local SDK is missing built artifacts:\n${missing.join('\n')}`);
  }
}

function ensureNodeModulesLink() {
  fs.mkdirSync(path.dirname(packageLink), { recursive: true });

  if (fs.existsSync(packageLink)) {
    const stat = fs.lstatSync(packageLink);
    if (stat.isSymbolicLink()) {
      const currentTarget = fs.realpathSync(packageLink);
      const desiredTarget = fs.realpathSync(sdkDir);
      if (currentTarget === desiredTarget) return;
    }
    fs.rmSync(packageLink, { recursive: true, force: true });
  }

  fs.symlinkSync(sdkDir, packageLink, process.platform === 'win32' ? 'junction' : 'dir');
}

function syncWasmArtifacts() {
  if (!fs.existsSync(wasmDir)) {
    fail(`Built WASM directory not found at ${wasmDir}`);
  }

  fs.mkdirSync(localWasmDir, { recursive: true });

  for (const entry of fs.readdirSync(wasmDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(wasmDir, entry.name);
    const to = path.join(localWasmDir, entry.name);
    fs.copyFileSync(from, to);
  }
}

ensureLocalSdkExists();

const canBuild = commandExists('wasm-pack') && (commandExists('tsup') || localBinExists('tsup'));
const shouldRebuild = process.env.FORCE_LOCAL_SDK_REBUILD === '1' || sdkSourcesAreNewerThanArtifacts();

if (canBuild && shouldRebuild) {
  console.log('[prepare-local-alkanes-sdk] Building local @alkanes/ts-sdk...');
  run('npm', ['run', 'build'], sdkDir);
} else {
  ensurePrebuiltArtifactsExist();
  if (shouldRebuild && process.env.ALLOW_STALE_LOCAL_SDK !== '1') {
    fail(
      'Local SDK source files are newer than the checked-in WASM/dist artifacts, but wasm-pack and/or tsup are unavailable. Install the SDK build toolchain and rerun, or set ALLOW_STALE_LOCAL_SDK=1 to intentionally run stale artifacts.',
    );
  }
  if (shouldRebuild) {
    console.warn(
      '[prepare-local-alkanes-sdk] Skipping full SDK rebuild because wasm-pack and/or tsup are unavailable. Using checked-in dist/ and wasm/ artifacts from agent-repos/alkanes-rs/ts-sdk instead.',
    );
  } else {
    console.log('[prepare-local-alkanes-sdk] Local @alkanes/ts-sdk artifacts are up to date; skipping rebuild.');
  }
}

console.log('[prepare-local-alkanes-sdk] Linking node_modules/@alkanes/ts-sdk to local checkout...');
ensureNodeModulesLink();

console.log('[prepare-local-alkanes-sdk] Syncing WASM alias files into lib/oyl/alkanes...');
syncWasmArtifacts();

console.log('[prepare-local-alkanes-sdk] Local SDK ready.');
