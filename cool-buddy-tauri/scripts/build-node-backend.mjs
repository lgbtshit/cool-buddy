import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import * as esbuild from 'esbuild';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..');
const entryPoint = join(projectRoot, 'node-backend', 'index.ts');
const outFile = join(projectRoot, 'src-tauri', 'generated', 'node-backend.mjs');
const bundledNodePath = join(
  projectRoot,
  'src-tauri',
  'generated',
  process.platform === 'win32' ? 'node.exe' : 'node'
);
const electronShimPath = join(projectRoot, 'node-backend', 'electron-shim.ts');
const agentSessionStorePath = join(projectRoot, 'node-backend', 'agent-session-store.ts');
const hostSystemMetricsPath = join(projectRoot, 'node-backend', 'system-metrics.ts');

mkdirSync(dirname(outFile), { recursive: true });

const aliasPlugin = {
  name: 'cool-buddy-node-backend-alias',
  setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({
      path: electronShimPath
    }));

    build.onResolve({ filter: /^\.\.\/data\/session-store$/ }, (args) => {
      if (args.importer.endsWith(join('src', 'main', 'harmless', 'runtime.ts'))) {
        return { path: agentSessionStorePath };
      }
      return null;
    });

    build.onResolve({ filter: /^\.\.\/ssh\/system-metrics$/ }, (args) => {
      if (args.importer.endsWith(join('src', 'main', 'harmless', 'runtime.ts'))) {
        return { path: hostSystemMetricsPath };
      }
      return null;
    });
  }
};

await esbuild.build({
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  absWorkingDir: workspaceRoot,
  plugins: [aliasPlugin],
  external: ['ssh2', 'cpu-features']
});

if (!existsSync(bundledNodePath)) {
  copyFileSync(process.execPath, bundledNodePath);
}

console.log(`[build-node-backend] Wrote ${outFile}`);
