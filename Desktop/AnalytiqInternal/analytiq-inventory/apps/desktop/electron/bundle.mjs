import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// The main process is bundled so the packaged app does not depend on pnpm's
// strict node_modules layout: electron-builder copies only top-level packages
// and silently drops transitive dependencies (socket.io-client -> engine.io,
// better-sqlite3 -> bindings). Native modules stay external and are unpacked
// from the asar by the build config.
const electronDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = path.join(electronDir, '..', 'dist-electron');
rmSync(outDir, { recursive: true, force: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: [
    'electron',
    '@analytiq/database',
    'better-sqlite3',
    'bufferutil',
    'utf-8-validate',
  ],
  logLevel: 'info',
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [path.join(electronDir, 'main.ts')],
    outfile: path.join(outDir, 'main.js'),
  }),
  build({
    ...shared,
    entryPoints: [path.join(electronDir, 'preload.ts')],
    outfile: path.join(outDir, 'preload.js'),
  }),
]);
