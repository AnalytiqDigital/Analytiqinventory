// electron-builder hook: ship better-sqlite3 compiled for Electron.
//
// pnpm installs the Node 24 prebuild (ABI 137), but the app runs on Electron 31
// (ABI 125). npmRebuild is off because rebuilding in place would break the
// Node-based test suites, so the packaged copy is replaced with the matching
// Electron prebuild from better-sqlite3's GitHub release.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const zlib = require('node:zlib');

const ELECTRON_ABI = 125; // Electron 31 — keep in step with the electron devDependency
const CACHE_DIR = path.join(__dirname, '..', 'build', 'native');

function download(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error(`Too many redirects for ${url}`));
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'analytiq-build' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(download(response.headers.location, redirects + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed (${response.statusCode}) for ${url}`));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

/** Minimal tar reader: enough for the single .node entry in a prebuild tarball. */
function extractNodeBinary(tarball) {
  const tar = zlib.gunzipSync(tarball);
  let offset = 0;
  let longName = '';
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8);
    const type = String.fromCharCode(header[156] || 48);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/, '');
    if (type === '0' || type === '\0') {
      const entry = longName || name;
      longName = '';
      if (entry.endsWith('better_sqlite3.node')) return Buffer.from(body);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

async function electronBinaryFor(version) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, `better_sqlite3-v${version}-electron-v${ELECTRON_ABI}.node`);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 1_000_000) return cached;

  const url =
    `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}/` +
    `better-sqlite3-v${version}-electron-v${ELECTRON_ABI}-win32-x64.tar.gz`;
  console.log(`  • downloading electron prebuild ${url}`);
  const binary = extractNodeBinary(await download(url));
  if (!binary || binary.length < 1_000_000) {
    throw new Error(`Could not extract better_sqlite3.node from the Electron v${version} prebuild`);
  }
  fs.writeFileSync(cached, binary);
  return cached;
}

function findPackagedModules(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'better-sqlite3') {
        const manifest = path.join(full, 'package.json');
        if (fs.existsSync(manifest)) found.push(full);
        continue;
      }
      walk(full);
    }
  };
  walk(root);
  return found;
}

exports.default = async function afterPack(context) {
  const resources = path.join(context.appOutDir, 'resources');
  if (!fs.existsSync(resources)) return;
  const modules = findPackagedModules(resources);
  if (modules.length === 0) {
    console.warn('  • afterPack: no packaged better-sqlite3 found');
    return;
  }

  for (const moduleDir of modules) {
    const version = JSON.parse(fs.readFileSync(path.join(moduleDir, 'package.json'), 'utf8')).version;
    const binary = await electronBinaryFor(version);
    const target = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');
    if (!fs.existsSync(path.dirname(target))) {
      console.warn(`  • afterPack: unexpected layout, skipping ${moduleDir}`);
      continue;
    }
    fs.copyFileSync(binary, target);
    // Fail the build now rather than at first launch on a customer machine.
    execFileSync(
      require('electron'),
      ['-e', `require(${JSON.stringify(target.replace(/\\/g, '/'))}); console.log('native ok')`],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' }
    );
    console.log(`  • afterPack: better-sqlite3 ${version} built for Electron ABI ${ELECTRON_ABI}`);
  }
};
