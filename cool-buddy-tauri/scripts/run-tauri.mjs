import { accessSync, constants, existsSync } from 'node:fs';
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
const env = {
  ...process.env,
  PATH: [...rustBinDirs, process.env.PATH ?? ''].filter(Boolean).join(delimiter),
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
