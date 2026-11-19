#!/usr/bin/env node
// Fails a release build when no code-signing certificate is configured.
// electron-builder reads CSC_LINK (path, https URL or base64 of the .pfx)
// and CSC_KEY_PASSWORD; plain `pnpm dist` still builds unsigned for local
// testing. See docs/UPDATES.md.

import { existsSync } from 'node:fs';

const link = process.env.CSC_LINK?.trim();
if (!link) {
  console.error(
    'CSC_LINK is not set, so the installer would be unsigned.\n' +
      'Install a Windows code-signing certificate, set CSC_LINK (and CSC_KEY_PASSWORD),\n' +
      'then re-run `pnpm dist:signed`. See docs/UPDATES.md.'
  );
  process.exit(1);
}

const isRemote = /^(https:\/\/|data:|base64:)/.test(link);
if (!isRemote && !existsSync(link)) {
  console.error(`CSC_LINK points at ${link}, which does not exist.`);
  process.exit(1);
}

console.log('Code-signing certificate configured; building a signed installer.');
