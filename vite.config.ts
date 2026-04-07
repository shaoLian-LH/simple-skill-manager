import path from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(repoRoot, 'src', 'ui', 'web', 'app');

export default defineConfig({
  root: webRoot,
  plugins: [vue()],
  build: {
    outDir: path.resolve(webRoot, '..', 'build'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/chunks/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/styles.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
