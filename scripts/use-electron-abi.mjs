// Swaps the better-sqlite3 native binary back to the Electron-ABI build saved by
// fetch-node-prebuild.mjs. Run this before launching the desktop app after a test run.
import { copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json'));
const releaseDir = path.join(pkgDir, 'build/Release');
const electronBinary = path.join(releaseDir, 'better_sqlite3.electron.node');
const nodeBinary = path.join(releaseDir, 'better_sqlite3.node');

if (!existsSync(electronBinary)) {
  console.error(
    `no Electron-ABI binary at ${electronBinary}; run \`pnpm rebuild better-sqlite3\` inside apps/desktop instead`,
  );
  process.exit(1);
}

copyFileSync(electronBinary, nodeBinary);
console.log(`restored Electron-ABI binary -> ${nodeBinary}`);