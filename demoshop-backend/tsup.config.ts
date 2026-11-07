import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.js'],
  format: ['cjs'],
  external: ['better-sqlite3', 'sharp'],
  noExternal: ['jose'],
  clean: false,
  sourcemap: false,
  minify: false,
  onSuccess: async () => {
    const source = resolve('src/utils/receipt/demoshop_logo.png');
    const output = resolve('dist/demoshop_logo.png');
    mkdirSync(resolve('dist'), { recursive: true });
    copyFileSync(source, output);
  },
});
