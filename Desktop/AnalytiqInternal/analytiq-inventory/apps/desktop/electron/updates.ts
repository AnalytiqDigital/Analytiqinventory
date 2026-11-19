import { app, ipcMain, shell } from 'electron';
import log from 'electron-log';

// Updates are opt-in per install: the app only looks for a release manifest
// when ANALYTIQ_UPDATE_URL points at an https host that serves latest.json.
// Nothing is downloaded or installed automatically — the operator sees the new
// version and downloads the installer when ready.

const UPDATE_ENV = 'ANALYTIQ_UPDATE_URL';
const CHECK_TIMEOUT_MS = 8_000;

export interface UpdateCheck {
  ok: boolean;
  configured: boolean;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  url?: string;
  notes?: string;
  error?: string;
  code?: string;
}

interface Manifest {
  version: string;
  url: string;
  notes?: string;
}

function baseUrl(): string | null {
  const raw = process.env[UPDATE_ENV]?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function versionParts(version: string): number[] {
  const [core = ''] = version.split('-');
  return core.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

/** Positive when `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseManifest(raw: unknown): Manifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.version !== 'string' || data.version.trim().length === 0) return null;
  if (typeof data.url !== 'string' || data.url.trim().length === 0) return null;
  try {
    const link = new URL(data.url);
    const local = link.hostname === 'localhost' || link.hostname === '127.0.0.1';
    if (link.protocol !== 'https:' && !(link.protocol === 'http:' && local)) return null;
  } catch {
    return null;
  }
  return {
    version: data.version.trim(),
    url: data.url.trim(),
    notes: typeof data.notes === 'string' ? data.notes.slice(0, 2000) : undefined,
  };
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  const currentVersion = app.getVersion();
  const base = baseUrl();
  if (!base) {
    return {
      ok: false,
      configured: false,
      currentVersion,
      code: 'UPDATE_NOT_CONFIGURED',
      error: 'This build does not check for updates. Set ANALYTIQ_UPDATE_URL to enable it.',
    };
  }
  try {
    const response = await fetch(`${base}/latest.json`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        currentVersion,
        code: 'UPDATE_FEED',
        error: `The update feed answered ${response.status}`,
      };
    }
    const manifest = parseManifest(await response.json());
    if (!manifest) {
      return {
        ok: false,
        configured: true,
        currentVersion,
        code: 'UPDATE_FEED',
        error: 'The update feed is not a valid latest.json',
      };
    }
    return {
      ok: true,
      configured: true,
      currentVersion,
      latestVersion: manifest.version,
      updateAvailable: compareVersions(manifest.version, currentVersion) > 0,
      url: manifest.url,
      notes: manifest.notes,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      configured: true,
      currentVersion,
      code: 'UPDATE_UNREACHABLE',
      error: err instanceof Error ? err.message : 'Could not reach the update feed',
    };
  }
}

function safeUpdateLink(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  try {
    const parsed = new URL(raw);
    const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function registerUpdateHandlers(): void {
  ipcMain.handle('app:update-check', async () => checkForUpdates());

  ipcMain.handle('app:open-external', async (_event, raw: unknown) => {
    const url = safeUpdateLink(raw);
    if (!url) return { ok: false, error: 'Only web links can be opened', code: 'INVALID_URL' };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not open the link',
        code: 'OPEN_FAILED',
      };
    }
  });

  void checkForUpdates().then((result) => {
    if (!result.configured) return;
    if (result.updateAvailable) {
      log.info(`Update available: ${result.latestVersion} (running ${result.currentVersion})`);
    } else if (result.ok) {
      log.info('No update available');
    } else {
      log.warn(`Update check failed: ${result.error}`);
    }
  });
}
