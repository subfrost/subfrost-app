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
const BUILD_DIR = path.join(PROJECT_ROOT, '.subfrost-build');
const ALKANES_RS_DIR = path.join(BUILD_DIR, 'alkanes-rs');
const ALKANES_RS_REPO = 'https://github.com/kungfuflex/alkanes-rs.git';
const TS_SDK_SOURCE = path.join(ALKANES_RS_DIR, 'ts-sdk');
const TS_SDK_TARGET = path.join(PROJECT_ROOT, 'ts-sdk');

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
  console.log(`\n📦 Setting up alkanes-rs (branch: ${sdkBranch})...`);
  
  ensureDir(BUILD_DIR);
  
  if (!fs.existsSync(ALKANES_RS_DIR)) {
    console.log('Cloning alkanes-rs repository...');
    exec(`git clone ${ALKANES_RS_REPO} ${ALKANES_RS_DIR}`);
    exec(`git checkout ${sdkBranch}`, { cwd: ALKANES_RS_DIR });
  } else {
    console.log('alkanes-rs already cloned, updating...');
    
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
  try {
    exec('rustup target add wasm32-unknown-unknown');
    console.log('✓ wasm32-unknown-unknown target ready');
  } catch (error) {
    console.warn('⚠️  Failed to add wasm32 target, but continuing...');
  }
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

function buildAlkanesWebSysInDir(dir) {
  console.log(`Building in: ${dir}`);
  
  // Build with wasm-pack
  exec('wasm-pack build --target web --out-dir ../../ts-sdk/build/wasm', { cwd: dir });
  
  console.log('✓ alkanes-web-sys WASM built successfully');
}

// Build ts-sdk
function buildTsSdk() {
  console.log('\n🔨 Building ts-sdk...');
  
  if (!fs.existsSync(TS_SDK_SOURCE)) {
    console.error('❌ ts-sdk directory not found at:', TS_SDK_SOURCE);
    throw new Error('ts-sdk not found in alkanes-rs repository');
  }
  
  // Install dependencies if needed
  if (!fs.existsSync(path.join(TS_SDK_SOURCE, 'node_modules'))) {
    console.log('Installing ts-sdk dependencies...');
    exec('npm install', { cwd: TS_SDK_SOURCE });
  }
  
  // Run the build script
  exec('npm run build', { cwd: TS_SDK_SOURCE });
  
  console.log('✓ ts-sdk built successfully');
}

// Copy built ts-sdk to project
function updateLocalTsSdk() {
  console.log('\n📦 Updating local ts-sdk...');
  
  // Ensure target directory exists
  ensureDir(TS_SDK_TARGET);
  
  // Copy essential directories and files
  const itemsToCopy = [
    'build',
    'dist',
    'src',
    'package.json',
    'tsconfig.json',
    'tsup.config.ts'
  ];
  
  itemsToCopy.forEach(item => {
    const source = path.join(TS_SDK_SOURCE, item);
    const target = path.join(TS_SDK_TARGET, item);
    
    if (fs.existsSync(source)) {
      if (fs.lstatSync(source).isDirectory()) {
        // Remove target if exists
        if (fs.existsSync(target)) {
          fs.rmSync(target, { recursive: true, force: true });
        }
        // Copy directory
        copyDir(source, target);
      } else {
        // Copy file
        fs.copyFileSync(source, target);
      }
      console.log(`  ✓ ${item}`);
    }
  });
  
  console.log('✓ Local ts-sdk updated');
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
    
    // Update local ts-sdk
    updateLocalTsSdk();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Build completed successfully!');
    console.log('\nThe ts-sdk has been updated with the latest WASM build.');
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
