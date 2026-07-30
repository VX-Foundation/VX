const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/;

export type SameSite = 'Strict' | 'Lax' | 'None';
export type CookiePriority = 'Low' | 'Medium' | 'High';

export interface CookieOptions {
  domain?: string;
  path?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
  partitioned?: boolean;
  priority?: CookiePriority;
}

export class CookieJar {
  readonly #values = new Map<string, string>();
  readonly #pending: string[] = [];

  constructor(header?: string | null) {
    if (!header) return;
    for (const segment of header.split(';')) {
      const index = segment.indexOf('=');
      if (index <= 0) continue;
      const name = segment.slice(0, index).trim();
      const raw = segment.slice(index + 1).trim();
      if (!COOKIE_NAME.test(name) || this.#values.has(name)) continue;
      try { this.#values.set(name, decodeURIComponent(raw)); } catch { this.#values.set(name, raw); }
    }
  }

  get(name: string): string | undefined { return this.#values.get(name); }
  has(name: string): boolean { return this.#values.has(name); }
  entries(): IterableIterator<[string, string]> { return this.#values.entries(); }

  set(name: string, value: string, options: CookieOptions = {}): void {
    validateCookie(name, value, options);
    this.#values.set(name, value);
    this.#pending.push(serializeCookie(name, value, options));
  }

  delete(name: string, options: Omit<CookieOptions, 'expires' | 'maxAge'> = {}): void {
    this.#values.delete(name);
    this.#pending.push(serializeCookie(name, '', { ...options, expires: new Date(0), maxAge: 0 }));
  }

  apply(headers: Headers): void {
    for (const value of this.#pending) headers.append('set-cookie', value);
  }

  pending(): readonly string[] { return Object.freeze([...this.#pending]); }
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  validateCookie(name, value, options);
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.partitioned) parts.push('Partitioned');
  if (options.priority) parts.push(`Priority=${options.priority}`);
  return parts.join('; ');
}

function validateCookie(name: string, value: string, options: CookieOptions): void {
  if (!COOKIE_NAME.test(name)) throw new TypeError(`Invalid cookie name '${name}'.`);
  if (CONTROL.test(value)) throw new TypeError(`Cookie '${name}' contains control characters.`);
  if (options.domain && (CONTROL.test(options.domain) || /[;,\s]/.test(options.domain))) throw new TypeError('Invalid cookie domain.');
  if (options.path && (CONTROL.test(options.path) || options.path.includes(';'))) throw new TypeError('Invalid cookie path.');
  if (options.sameSite === 'None' && !options.secure) throw new TypeError('SameSite=None cookies must be Secure.');
  if (options.partitioned && !options.secure) throw new TypeError('Partitioned cookies must be Secure.');
  if (name.startsWith('__Host-') && (!options.secure || options.domain || options.path !== '/')) {
    throw new TypeError('__Host- cookies require Secure, Path=/, and no Domain.');
  }
  if (name.startsWith('__Secure-') && !options.secure) throw new TypeError('__Secure- cookies require Secure.');
}
