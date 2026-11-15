import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Explicit Promise wrapper: promisify(scrypt) resolves to the 3-arg overload
// and rejects the 4-arg (options) call at type level.
function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

/**
 * Password hashing via Node scrypt (memory-hard, OWASP-acceptable).
 * Argon2id remains the locked stack choice for the LAN/cloud servers
 * (Batch 7/8); the embedded desktop DB uses scrypt to avoid shipping a
 * native argon2 module in the Electron bundle. Parameters are versioned
 * in the hash so a future Argon2id migration can re-hash on login.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `scrypt1:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [version, saltHex, hashHex] = stored.split(':');
  if (version !== 'scrypt1' || !saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}
