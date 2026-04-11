import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin/skm.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  clean: true,
  minify: true,
  sourcemap: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
