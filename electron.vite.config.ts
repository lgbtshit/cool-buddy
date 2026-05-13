import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

const frameworkPackages = ['vue', 'vue-router', 'pinia'];
const routeChunkMatchers = [
  {
    matcher: '/src/renderer/src/views/ssh-workbench/',
    chunk: 'route-ssh-workbench'
  }
];

function getAssetOutputPath(name: string | undefined): string {
  if (!name) {
    return 'assets/[name]-[hash][extname]';
  }

  const normalizedName = name.replace(/\\/g, '/');
  const extension = normalizedName.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'css') {
    return 'css/[name]-[hash][extname]';
  }

  if (['woff', 'woff2', 'ttf', 'otf', 'eot'].includes(extension)) {
    return 'assets/fonts/[name]-[hash][extname]';
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico'].includes(extension)) {
    return 'assets/images/[name]-[hash][extname]';
  }

  if (['mp4', 'webm', 'ogg', 'mp3', 'wav', 'flac', 'aac'].includes(extension)) {
    return 'assets/media/[name]-[hash][extname]';
  }

  return 'assets/[name]-[hash][extname]';
}

function getManualChunk(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');

  for (const routeChunk of routeChunkMatchers) {
    if (normalizedId.includes(routeChunk.matcher)) {
      return routeChunk.chunk;
    }
  }

  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  if (frameworkPackages.some((pkg) => normalizedId.includes(`/node_modules/${pkg}/`))) {
    return 'framework-core';
  }

  if (normalizedId.includes('/node_modules/element-plus/')) {
    return 'ui-element-plus';
  }

  if (normalizedId.includes('/node_modules/lucide-vue-next/')) {
    return 'ui-lucide';
  }

  if (
    normalizedId.includes('/node_modules/xterm/') ||
    normalizedId.includes('/node_modules/@xterm/')
  ) {
    return 'ui-terminal';
  }

  if (normalizedId.includes('/node_modules/vue-markdown-stream/')) {
    return 'ui-markdown';
  }

  if (
    normalizedId.includes('/node_modules/axios/') ||
    normalizedId.includes('/node_modules/zod/') ||
    normalizedId.includes('/node_modules/@vueuse/core/')
  ) {
    return 'vendor-utils';
  }

  return 'vendor';
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: ['electron', 'better-sqlite3', 'ssh2']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 3200
    },
    build: {
      cssCodeSplit: true,
      rollupOptions: {
        onwarn(warning, warn) {
          if (
            warning.message.includes('contains an annotation that Rollup cannot interpret') &&
            warning.message.includes('/@vueuse/core/dist/index.js')
          ) {
            return;
          }

          warn(warning);
        },
        output: {
          entryFileNames: 'js/[name]-[hash].js',
          chunkFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => getAssetOutputPath(assetInfo.name),
          manualChunks: getManualChunk
        }
      }
    }
  }
});
