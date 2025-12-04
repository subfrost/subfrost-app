#!/usr/bin/env node

/**
 * Build script for external dependencies (alkanes-rs)
 * 
 * This script:
 * 1. Clones alkanes-rs if not present
 * 2. Checks out the specified branch from package.json
 * 3. Pulls latest changes
 * 4. Installs system dependencies (Rust, wasm-pack, etc.)
 * 5. Builds the ts-sdk with WASM
 * 6. Updates the local ts-sdk directory
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const os = require('os');

// Configuration
const PROJECT_ROOT = __dirname;
const BUILD_DIR = path.join(PROJECT_ROOT, '.external-build');
// Allow using a local alkanes-rs repo via ALKANES_RS_LOCAL env var (for development)
const LOCAL_ALKANES_RS = process.env.ALKANES_RS_LOCAL || null;
const ALKANES_RS_DIR = LOCAL_ALKANES_RS || path.join(BUILD_DIR, 'alkanes-rs');
const ALKANES_RS_REPO = 'https://github.com/kungfuflex/alkanes-rs.git';
const TS_SDK_SOURCE = path.join(ALKANES_RS_DIR, 'ts-sdk');
const TS_SDK_DEST = path.join(PROJECT_ROOT, 'ts-sdk');

// Read package.json to get sdkBranch
function getSdkBranch() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    return packageJson.sdkBranch || 'kungfuflex/develop';
  } catch (error) {
    console.error('Error reading package.json:', error.message);
    return 'kungfuflex/develop';
  }
}

// Execute command with output
function exec(command, options = {}) {
  console.log(`\n$ ${command}`);
  try {
    return execSync(command, {
      stdio: 'inherit',
      cwd: options.cwd || PROJECT_ROOT,
      ...options
    });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    throw error;
  }
}

// Execute command silently and return output
function execSilent(command, options = {}) {
  try {
    return execSync(command, {
      cwd: options.cwd || PROJECT_ROOT,
      encoding: 'utf8',
      ...options
    }).trim();
  } catch (error) {
    return null;
  }
}

// Check if command exists
function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: true
  });
  return result.status === 0;
}

// Ensure directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
}

// Install Rust and Cargo
function installRust() {
  if (commandExists('cargo')) {
    console.log('✓ Rust/Cargo already installed');
    const version = execSilent('rustc --version');
    console.log(`  ${version}`);
    return;
  }

  console.log('📦 Installing Rust via rustup...');
  
  if (os.platform() === 'win32') {
    console.log('Please install Rust manually from https://rustup.rs/');
    console.log('After installation, run this script again.');
    process.exit(1);
  }

  exec('curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable');
  
  // Source cargo env
  const cargoEnv = path.join(os.homedir(), '.cargo', 'env');
  if (fs.existsSync(cargoEnv)) {
    console.log('Sourcing cargo environment...');
    process.env.PATH = `${path.join(os.homedir(), '.cargo', 'bin')}:${process.env.PATH}`;
  }
}

// Install wasm-pack
function installWasmPack() {
  if (commandExists('wasm-pack')) {
    console.log('✓ wasm-pack already installed');
    const version = execSilent('wasm-pack --version');
    console.log(`  ${version}`);
    return;
  }

  console.log('📦 Installing wasm-pack...');
  exec('cargo install wasm-pack');
}

// Install system dependencies (Linux only)
function installSystemDeps() {
  const platform = os.platform();
  
  if (platform === 'linux') {
    console.log('📦 Checking Linux system dependencies...');
    
    // Check if we have apt-get (Debian/Ubuntu)
    if (commandExists('apt-get')) {
      const packages = [
        'libclang-dev',
        'clang',
        'llvm',
        'pkg-config',
        'libssl-dev',
        'protobuf-compiler'
      ];
      
      console.log('Installing required packages with apt-get...');
      console.log('Note: This may require sudo privileges');
      
      try {
        exec(`sudo apt-get update && sudo apt-get install -y ${packages.join(' ')}`);
      } catch (error) {
        console.warn('⚠️  Failed to install some system dependencies. Build may fail.');
        console.warn('   Please install manually: ' + packages.join(' '));
      }
    } else if (commandExists('yum')) {
      // RedHat/CentOS
      const packages = [
        'clang-devel',
        'llvm-devel',
        'pkg-config',
        'openssl-devel',
        'protobuf-compiler'
      ];
      
      console.log('Installing required packages with yum...');
      try {
        exec(`sudo yum install -y ${packages.join(' ')}`);
      } catch (error) {
        console.warn('⚠️  Failed to install some system dependencies.');
      }
    } else {
      console.log('⚠️  Unknown package manager. Please install dependencies manually:');
      console.log('   libclang-dev, clang, llvm, pkg-config, libssl-dev, protobuf-compiler');
    }
  } else if (platform === 'darwin') {
    console.log('📦 Checking macOS system dependencies...');
    
    if (commandExists('brew')) {
      const packages = ['llvm', 'pkg-config', 'openssl', 'protobuf'];
      
      console.log('Installing required packages with Homebrew...');
      try {
        exec(`brew install ${packages.join(' ')}`);
      } catch (error) {
        console.warn('⚠️  Failed to install some dependencies via Homebrew.');
      }
    } else {
      console.log('⚠️  Homebrew not found. Please install from https://brew.sh/');
      console.log('   Then install: llvm pkg-config openssl protobuf');
    }
  } else if (platform === 'win32') {
    console.log('ℹ️  Windows detected. Skipping system dependency installation.');
    console.log('   If build fails, you may need to install Visual Studio Build Tools.');
  }
}

// Clone or update alkanes-rs repository
function setupAlkanesRepo() {
  const sdkBranch = getSdkBranch();

  // If using local alkanes-rs, skip git operations
  if (LOCAL_ALKANES_RS) {
    console.log(`\n📦 Using local alkanes-rs at: ${LOCAL_ALKANES_RS}`);
    if (!fs.existsSync(LOCAL_ALKANES_RS)) {
      throw new Error(`Local alkanes-rs directory not found: ${LOCAL_ALKANES_RS}`);
    }
    console.log('✓ Local alkanes-rs repository ready');
    return;
  }

  console.log(`\n📦 Setting up alkanes-rs (branch: ${sdkBranch})...`);

  ensureDir(BUILD_DIR);

  if (!fs.existsSync(ALKANES_RS_DIR)) {
    console.log('Cloning alkanes-rs repository...');
    exec(`git clone ${ALKANES_RS_REPO} ${ALKANES_RS_DIR}`);
    exec(`git checkout ${sdkBranch}`, { cwd: ALKANES_RS_DIR });
  } else {
    console.log('alkanes-rs already cloned, updating...');

    // Ensure remote URL uses HTTPS (not SSH) to avoid permission issues
    const currentRemote = execSilent('git remote get-url origin', { cwd: ALKANES_RS_DIR });
    if (currentRemote && !currentRemote.startsWith('https://')) {
      console.log(`Switching remote from ${currentRemote} to HTTPS...`);
      exec(`git remote set-url origin ${ALKANES_RS_REPO}`, { cwd: ALKANES_RS_DIR });
    }

    // Fetch latest changes
    exec('git fetch origin', { cwd: ALKANES_RS_DIR });

    // Get current branch
    const currentBranch = execSilent('git rev-parse --abbrev-ref HEAD', { cwd: ALKANES_RS_DIR });

    if (currentBranch !== sdkBranch) {
      console.log(`Switching from ${currentBranch} to ${sdkBranch}...`);
      exec(`git checkout ${sdkBranch}`, { cwd: ALKANES_RS_DIR });
    }

    // Pull latest changes
    exec(`git pull origin ${sdkBranch}`, { cwd: ALKANES_RS_DIR });
  }

  console.log('✓ alkanes-rs repository ready');
}

// Add wasm32 target
function addWasm32Target() {
  console.log('\n📦 Adding wasm32-unknown-unknown target...');
  exec('rustup target add wasm32-unknown-unknown');
  console.log('✓ wasm32-unknown-unknown target ready');
}

// Build alkanes-web-sys WASM
function buildAlkanesWebSys() {
  console.log('\n🔨 Building alkanes-web-sys WASM...');
  
  const alkanesWebSysDir = path.join(ALKANES_RS_DIR, 'crates', 'alkanes-web-sys');
  
  if (!fs.existsSync(alkanesWebSysDir)) {
    console.error('❌ alkanes-web-sys directory not found at:', alkanesWebSysDir);
    console.log('Repository structure may have changed. Checking for alternative locations...');
    
    // Try to find it
    const possibleDirs = [
      path.join(ALKANES_RS_DIR, 'alkanes-web-sys'),
      path.join(ALKANES_RS_DIR, 'packages', 'alkanes-web-sys'),
    ];
    
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        console.log(`Found at: ${dir}`);
        return buildAlkanesWebSysInDir(dir);
      }
    }
    
    throw new Error('alkanes-web-sys not found in repository');
  }
  
  buildAlkanesWebSysInDir(alkanesWebSysDir);
}

// Get macOS build environment with Homebrew LLVM
function getMacOSBuildEnv() {
  const buildEnv = { ...process.env };
  
  if (os.platform() !== 'darwin') {
    return buildEnv;
  }
  
  console.log('📦 Configuring macOS build environment for Homebrew LLVM...');
  
  // Check for Homebrew LLVM installation
  const homebrewPrefixes = ['/opt/homebrew', '/usr/local'];
  let llvmPath = null;
  
  for (const prefix of homebrewPrefixes) {
    const testPath = path.join(prefix, 'opt', 'llvm', 'bin', 'clang');
    if (fs.existsSync(testPath)) {
      llvmPath = path.join(prefix, 'opt', 'llvm');
      console.log(`  ✓ Found Homebrew LLVM at: ${llvmPath}`);
      break;
    }
  }
  
  if (llvmPath) {
    // Set AR and CC to use Homebrew LLVM
    buildEnv.AR = path.join(llvmPath, 'bin', 'llvm-ar');
    buildEnv.CC = path.join(llvmPath, 'bin', 'clang');
    
    // Prepend Homebrew LLVM bin to PATH to prioritize over Xcode clang
    buildEnv.PATH = `${path.join(llvmPath, 'bin')}:${buildEnv.PATH}`;
    
    console.log(`  ✓ AR=${buildEnv.AR}`);
    console.log(`  ✓ CC=${buildEnv.CC}`);
    console.log(`  ✓ PATH updated to prioritize Homebrew LLVM`);
  } else {
    console.warn('  ⚠️  Homebrew LLVM not found. Install with: brew install llvm');
    console.warn('  ⚠️  Build may fail on macOS without Homebrew LLVM toolchain');
  }
  
  return buildEnv;
}

function buildAlkanesWebSysInDir(dir) {
  console.log(`Building in: ${dir}`);
  
  const buildEnv = getMacOSBuildEnv();
  
  // Build with wasm-pack using the configured environment
  exec('wasm-pack build --target web --out-dir ../../ts-sdk/build/wasm', { 
    cwd: dir,
    env: buildEnv
  });
  
  console.log('✓ alkanes-web-sys WASM built successfully');
}

// Build ts-sdk
function buildTsSdk() {
  console.log('\n🔨 Building ts-sdk...');
  
  if (!fs.existsSync(TS_SDK_SOURCE)) {
    console.error('❌ ts-sdk directory not found at:', TS_SDK_SOURCE);
    throw new Error('ts-sdk not found in alkanes-rs repository');
  }
  
  // Get the macOS build environment (for any WASM compilation that may happen)
  const buildEnv = getMacOSBuildEnv();
  
  // Install dependencies if needed
  if (!fs.existsSync(path.join(TS_SDK_SOURCE, 'node_modules'))) {
    console.log('Installing ts-sdk dependencies...');
    exec('npm install', { cwd: TS_SDK_SOURCE, env: buildEnv });
  }
  
  // Ensure tsup.config.ts has dts: false (due to WASM binding issues)
  const tsupConfigPath = path.join(TS_SDK_SOURCE, 'tsup.config.ts');
  if (fs.existsSync(tsupConfigPath)) {
    let tsupConfig = fs.readFileSync(tsupConfigPath, 'utf8');
    if (tsupConfig.includes('dts: true')) {
      console.log('Resetting tsup.config.ts to skip TypeScript declarations (WASM binding issues)...');
      tsupConfig = tsupConfig.replace('dts: true', 'dts: false');
      fs.writeFileSync(tsupConfigPath, tsupConfig);
    }
  }
  
  // Run the build script with the macOS build environment
  exec('npm run build', { cwd: TS_SDK_SOURCE, env: buildEnv });
  
  console.log('✓ ts-sdk built successfully');
}

// Update ts-sdk package.json to use hand-written type declarations
function updateTsSdkTypes() {
  console.log('\n📦 Updating ts-sdk type declarations...');
  
  // Copy the hand-written type declaration file from project root
  const projectDtsPath = path.join(PROJECT_ROOT, 'ts-sdk-types.d.ts');
  const targetDtsPath = path.join(TS_SDK_SOURCE, 'index.d.ts');
  
  if (fs.existsSync(projectDtsPath)) {
    fs.copyFileSync(projectDtsPath, targetDtsPath);
    console.log('  ✓ Copied type declarations');
  } else {
    console.warn('  ⚠️  Type declaration file not found, skipping...');
  }
  
  // Update package.json to point to the declaration file
  const packageJsonPath = path.join(TS_SDK_SOURCE, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.exports['.'].types = './index.d.ts';
    packageJson.types = './index.d.ts';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('  ✓ Updated package.json types');
  }
  
  console.log('✓ ts-sdk types updated');
}

// Recursively copy directory
function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy only built artifacts from ts-sdk to project root
function copyTsSdkArtifacts() {
  console.log('\n📦 Copying ts-sdk artifacts to ./ts-sdk...');
  
  if (!fs.existsSync(TS_SDK_SOURCE)) {
    throw new Error(`ts-sdk source not found at ${TS_SDK_SOURCE}`);
  }
  
  // Remove existing destination if it exists
  if (fs.existsSync(TS_SDK_DEST)) {
    console.log('Removing existing ts-sdk directory...');
    fs.rmSync(TS_SDK_DEST, { recursive: true, force: true });
  }
  
  ensureDir(TS_SDK_DEST);
  
  // Files and directories to copy (only built artifacts)
  const itemsToCopy = [
    'dist',           // Compiled TypeScript output
    'build',          // WASM build output
    'package.json',   // Package metadata
    'index.d.ts',     // Type declarations
    'polyfills.js',   // Polyfills
    'esbuild.browser.mjs', // Build config (if needed)
    '.npmignore',     // NPM ignore file
    'README.md'       // Documentation
  ];
  
  for (const item of itemsToCopy) {
    const srcPath = path.join(TS_SDK_SOURCE, item);
    const destPath = path.join(TS_SDK_DEST, item);
    
    if (!fs.existsSync(srcPath)) {
      console.log(`⚠️  Skipping ${item} (not found)`);
      continue;
    }
    
    const stats = fs.statSync(srcPath);
    if (stats.isDirectory()) {
      copyDir(srcPath, destPath);
      console.log(`  ✓ Copied directory: ${item}`);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  ✓ Copied file: ${item}`);
    }
  }
  
  console.log('✅ ts-sdk artifacts copied successfully!');
}

// Main execution
function main() {
  console.log('🚀 Building external dependencies for subfrost-app\n');
  console.log('=' .repeat(60));
  
  try {
    // Install build dependencies
    installRust();
    installWasmPack();
    installSystemDeps();
    
    // Setup and build alkanes-rs
    setupAlkanesRepo();
    addWasm32Target();
    buildAlkanesWebSys();
    buildTsSdk();
    
    // Update ts-sdk type declarations
    updateTsSdkTypes();
    
    // Copy built artifacts to ./ts-sdk
    copyTsSdkArtifacts();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Build completed successfully!');
    console.log('\nThe ts-sdk artifacts have been copied to ./ts-sdk');
    console.log('You can now run your regular build process.');
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Build failed:', error.message);
    console.error('\nPlease check the error messages above and try again.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
