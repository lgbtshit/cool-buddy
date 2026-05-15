import { accessSync, constants, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function isExecutable(filePath) {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function collectRustBinDirs() {
  const home = homedir();
  const candidates = [
    'C:\\Program Files\\Rust stable MSVC 1.95\\bin',
    'C:\\Program Files\\Rust stable MSVC\\bin',
    join(home, '.cargo', 'bin')
  ];

  return candidates.filter((dirPath, index, list) => {
    if (!dirPath || list.indexOf(dirPath) !== index) return false;
    return existsSync(dirPath);
  });
}

function resolveTauriCliBin() {
  const packageJsonPath = require.resolve('@tauri-apps/cli/package.json');
  const packageDir = dirname(packageJsonPath);
  const windowsBin = join(packageDir, 'tauri.js');
  if (isExecutable(windowsBin)) {
    return windowsBin;
  }

  return join(packageDir, 'tauri.js');
}

function findBinary(binaryName, dirs) {
  for (const dirPath of dirs) {
    const binaryPath = join(dirPath, binaryName);
    if (isExecutable(binaryPath)) {
      return binaryPath;
    }
  }
  return null;
}

const rustBinDirs = collectRustBinDirs();
const cargoPath = findBinary('cargo.exe', rustBinDirs);
const rustcPath = findBinary('rustc.exe', rustBinDirs);

async function buildNodeBackend() {
  const backendScript = join(process.cwd(), 'scripts', 'build-node-backend.mjs');
  const generatedDir = join(process.cwd(), 'src-tauri', 'generated');

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [backendScript], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Node backend build failed with exit code ${code ?? 1}.`));
    });
  });

  mkdirSync(generatedDir, { recursive: true });
  const bundledNodePath = join(generatedDir, process.platform === 'win32' ? 'node.exe' : 'node');
  if (!existsSync(bundledNodePath)) {
    copyFileSync(process.execPath, bundledNodePath);
  }
}

await buildNodeBackend();

const env = {
  ...process.env,
  PATH: [...rustBinDirs, process.env.PATH ?? ''].filter(Boolean).join(delimiter),
  COOL_BUDDY_NODE_EXECUTABLE: process.execPath,
  ...(cargoPath ? { CARGO: cargoPath } : {}),
  ...(rustcPath ? { RUSTC: rustcPath } : {})
};

const tauriBin = resolveTauriCliBin();
const args = [tauriBin, ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env,
  cwd: process.cwd()
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[run-tauri] Failed to start Tauri CLI.');
  console.error(error);
  process.exit(1);
});
