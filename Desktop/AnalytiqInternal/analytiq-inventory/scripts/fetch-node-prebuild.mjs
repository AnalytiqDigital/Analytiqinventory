// Fetches a Node-ABI prebuilt better-sqlite3 binary so the vitest suite can run
// under the local Node version. The Electron-ABI binary is preserved alongside it
// (build/Release/better_sqlite3.electron.node) and restored by restore-electron-abi.mjs.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// better-sqlite3 is installed under the desktop app's workspace, not the repo root.
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json'));
const bin = path.join(path.dirname(pkgDir), 'prebuild-install/bin.js');
const releaseDir = path.join(pkgDir, 'build/Release');
const electronBinary = path.join(releaseDir, 'better_sqlite3.electron.node');
const nodeBinary = path.join(releaseDir, 'better_sqlite3.node');

console.log(`package dir: ${pkgDir}`);

if (!existsSync(bin)) {
  console.error(`prebuild-install not found at ${bin}`);
  process.exit(1);
}

// Keep the Electron-ABI binary so `node scripts/use-electron-abi.mjs` can put it back.
if (!existsSync(electronBinary) && existsSync(nodeBinary)) {
  copyFileSync(nodeBinary, electronBinary);
  console.log(`saved electron-ABI binary -> ${electronBinary}`);
}

const result = spawnSync(
  process.execPath,
  [bin, '-r', 'node', '-t', process.versions.node, '--verbose'],
  { cwd: pkgDir, stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error(`prebuild-install failed with status ${result.status}`);
  process.exit(result.status ?? 1);
}

try {
  const probe = require('better-sqlite3');
  const db = new probe(':memory:');
  console.log(`ok: better-sqlite3 loaded under node ${process.versions.node}`);
  db.close();
} catch (error) {
  console.error(`probe failed: ${error.message}`);
  process.exit(1);
}
