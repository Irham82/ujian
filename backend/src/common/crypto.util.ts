import * as argon2 from 'argon2';
import * as crypto from 'crypto';

const DEFAULT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  'cbt-pro-dev-access-secret-key-at-least-32-bytes-long-2026';

const DEFAULT_CSRF_SECRET =
  process.env.CSRF_SECRET ||
  'cbt-pro-dev-csrf-secret-key-at-least-32-bytes-long-2026';

export interface SessionTokenPayload {
  sub: string; // user_id
  schoolId: string;
  username: string;
  fullName: string;
  roles: string[];
  sid: string; // session_id for single-session / revocation enforcement
  iat: number;
  exp: number;
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MB OWASP recommended minimum for Argon2id
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) {
    str += '=';
  }
  return Buffer.from(str, 'base64');
}

export function signSessionToken(
  payload: Omit<SessionTokenPayload, 'iat' | 'exp'>,
  ttlSeconds = 8 * 3600,
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: SessionTokenPayload = {
    ...payload,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${header}.${body}`;
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', DEFAULT_ACCESS_SECRET).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const signingInput = `${header}.${body}`;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', DEFAULT_ACCESS_SECRET).update(signingInput).digest(),
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body).toString('utf8')) as SessionTokenPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < nowSec) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function generateCsrfToken(sessionId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const mac = crypto
    .createHmac('sha256', DEFAULT_CSRF_SECRET)
    .update(`${sessionId}:${nonce}`)
    .digest('hex');
  return `${nonce}.${mac}`;
}

export function verifyCsrfToken(sessionId: string, token: string): boolean {
  if (!token || !sessionId) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [nonce, mac] = parts;
  const expectedMac = crypto
    .createHmac('sha256', DEFAULT_CSRF_SECRET)
    .update(`${sessionId}:${nonce}`)
    .digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expectedMac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Deterministic Fisher-Yates shuffle seeded by (participantId + salt)
 * Ensures question and option order is unique per student session and recoverable on reload.
 */
export function deterministicShuffle<T>(items: readonly T[], seedString: string): T[] {
  const arr = [...items];
  let seedHash = crypto.createHash('sha256').update(seedString).digest();
  let byteOffset = 0;

  const nextUint32 = (): number => {
    if (byteOffset + 4 > seedHash.length) {
      seedHash = crypto.createHash('sha256').update(seedHash).digest();
      byteOffset = 0;
    }
    const val = seedHash.readUInt32BE(byteOffset);
    byteOffset += 4;
    return val;
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextUint32() % (i + 1);
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

export function encryptBackupPayload(plainJson: string, keySecret?: string): string {
  const rawKey = crypto
    .createHash('sha256')
    .update(keySecret || process.env.BACKUP_ENCRYPTION_KEY || 'cbt-pro-backup-default-key-2026')
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', rawKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainJson, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });
}

export function decryptBackupPayload(encryptedJson: string, keySecret?: string): string {
  const parsed = JSON.parse(encryptedJson) as {
    v: number;
    alg: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };
  const rawKey = crypto
    .createHash('sha256')
    .update(keySecret || process.env.BACKUP_ENCRYPTION_KEY || 'cbt-pro-backup-default-key-2026')
    .digest();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    rawKey,
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
