import { build } from 'esbuild';

await build({
  entryPoints: ['src/cdn.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  outfile: 'dist/qurvo.iife.js',
  minify: true,
  sourcemap: 'external',
});
