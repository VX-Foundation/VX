const TOKEN_VERSION = 'v1';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface CsrfTokenOptions {
  secret: string | Uint8Array;
  binding: string;
  ttlMs?: number;
  now?: number;
}

export async function createCsrfToken(options: CsrfTokenOptions): Promise<string> {
  assertCsrfOptions(options);
  const issuedAt = options.now ?? Date.now();
  const nonce = randomToken(24);
  const payload = `${TOKEN_VERSION}.${issuedAt}.${nonce}`;
  const signature = await sign(`${payload}.${options.binding}`, options.secret);
  return `${payload}.${signature}`;
}

export async function verifyCsrfToken(token: string, options: CsrfTokenOptions): Promise<boolean> {
  try {
    assertCsrfOptions(options);
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return false;
    const issuedAt = Number(parts[1]);
    if (!Number.isSafeInteger(issuedAt)) return false;
    const now = options.now ?? Date.now();
    const ttl = options.ttlMs ?? 2 * 60 * 60 * 1000;
    if (issuedAt > now + MAX_CLOCK_SKEW_MS || now - issuedAt > ttl) return false;
    const payload = parts.slice(0, 3).join('.');
    const expected = await sign(`${payload}.${options.binding}`, options.secret);
    return timingSafeEqual(expected, parts[3] ?? '');
  } catch {
    return false;
  }
}

export function csrfTokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get('x-vx-csrf')?.trim();
  return header || undefined;
}

async function sign(payload: string, secret: string | Uint8Array): Promise<string> {
  const bytes = normalizeBytes(secret);
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signature));
}

function normalizeBytes(value: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const source = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index]! ^ rightBytes[index]!;
  return difference === 0;
}

function randomToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function assertCsrfOptions(options: CsrfTokenOptions): void {
  const secretLength = typeof options.secret === 'string' ? new TextEncoder().encode(options.secret).byteLength : options.secret.byteLength;
  if (secretLength < 32) throw new TypeError('VX CSRF secrets must contain at least 32 bytes.');
  if (!options.binding) throw new TypeError('VX CSRF tokens require a non-empty session binding.');
}
