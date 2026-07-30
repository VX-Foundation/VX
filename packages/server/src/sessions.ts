import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { CookieJar, type CookieOptions } from './cookies.js';
import type { Awaitable, ServerPrincipal, ServerSession } from './types.js';

export interface SessionRecord<TData extends Record<string, unknown>> {
  id: string;
  data: TData;
  principal?: ServerPrincipal;
  createdAt: number;
  expiresAt: number;
}

export interface SessionStore<TData extends Record<string, unknown> = Record<string, unknown>> {
  get(id: string): Awaitable<SessionRecord<TData> | undefined>;
  set(record: SessionRecord<TData>): Awaitable<void>;
  delete(id: string): Awaitable<void>;
  touch?(id: string, expiresAt: number): Awaitable<void>;
}

export interface SessionManagerOptions<TData extends Record<string, unknown>> {
  secret: string | Uint8Array;
  store?: SessionStore<TData>;
  cookie?: CookieOptions & { name?: string };
  ttlMs?: number;
  rolling?: boolean;
  createData?: () => TData;
  now?: () => number;
}

export interface ResolvedSession<TData extends Record<string, unknown>> {
  session: ServerSession<TData>;
  commit(headers: Headers): Promise<void>;
}

export interface SessionManager<TData extends Record<string, unknown> = Record<string, unknown>> {
  resolve(request: Request, cookies?: CookieJar): Promise<ResolvedSession<TData>>;
  destroy(request: Request, headers: Headers, cookies?: CookieJar): Promise<void>;
}

export class MemorySessionStore<TData extends Record<string, unknown> = Record<string, unknown>> implements SessionStore<TData> {
  readonly #records = new Map<string, SessionRecord<TData>>();
  constructor(private readonly now: () => number = Date.now) {}
  async get(id: string): Promise<SessionRecord<TData> | undefined> {
    const record = this.#records.get(id);
    if (!record) return undefined;
    if (record.expiresAt <= this.now()) { this.#records.delete(id); return undefined; }
    return cloneRecord(record);
  }
  async set(record: SessionRecord<TData>): Promise<void> { this.#records.set(record.id, cloneRecord(record)); }
  async delete(id: string): Promise<void> { this.#records.delete(id); }
  async touch(id: string, expiresAt: number): Promise<void> {
    const record = this.#records.get(id);
    if (record) record.expiresAt = expiresAt;
  }
  size(): number { return this.#records.size; }
}

export function createSessionManager<TData extends Record<string, unknown> = Record<string, unknown>>(
  options: SessionManagerOptions<TData>
): SessionManager<TData> {
  const secret = normalizeSecret(options.secret);
  const now = options.now ?? Date.now;
  const store = options.store ?? new MemorySessionStore<TData>(now);
  const ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new TypeError('Session TTL must be a positive safe integer.');
  const cookieName = options.cookie?.name ?? '__Host-vx-session';
  const cookieOptions: CookieOptions = {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    ...withoutName(options.cookie)
  };

  return {
    async resolve(request, suppliedCookies) {
      const cookies = suppliedCookies ?? new CookieJar(request.headers.get('cookie'));
      const signed = cookies.get(cookieName);
      const id = signed ? verifySignedId(signed, secret) : undefined;
      const timestamp = now();
      const stored = id ? await store.get(id) : undefined;
      let currentId = stored?.id ?? randomId();
      let createdAt = stored?.createdAt ?? timestamp;
      let expiresAt = stored?.expiresAt ?? timestamp + ttlMs;
      let data = stored ? structuredCloneSafe(stored.data) : options.createData?.() ?? ({} as TData);
      let principal = stored?.principal;
      let isNew = !stored;
      let dirty = !stored;
      let destroyed = false;
      let regenerate = false;
      const session: ServerSession<TData> = {
        get id() { return currentId; },
        get data() { return data; },
        set data(value: TData) { data = value; dirty = true; },
        get principal() { return principal; },
        set principal(value: ServerPrincipal | undefined) { principal = value; dirty = true; },
        get createdAt() { return createdAt; },
        get expiresAt() { return expiresAt; },
        get isNew() { return isNew; },
        get isDirty() { return dirty; },
        get isDestroyed() { return destroyed; },
        set(key, value) { data[key] = value; dirty = true; },
        delete(key) { delete data[key]; dirty = true; },
        regenerate() { regenerate = true; dirty = true; },
        destroy() { destroyed = true; dirty = true; }
      };

      return {
        session,
        async commit(headers) {
          if (destroyed) {
            await store.delete(currentId);
            cookies.delete(cookieName, cookieOptions);
            cookies.apply(headers);
            return;
          }
          if (regenerate) {
            await store.delete(currentId);
            currentId = randomId();
            createdAt = now();
            isNew = true;
          }
          const nextExpiry = now() + ttlMs;
          if (dirty || isNew || expiresAt <= now()) {
            expiresAt = nextExpiry;
            await store.set({ id: currentId, data: structuredCloneSafe(data), ...(principal ? { principal } : {}), createdAt, expiresAt });
            cookies.set(cookieName, signId(currentId, secret), { ...cookieOptions, maxAge: Math.ceil(ttlMs / 1000) });
          } else if (options.rolling) {
            expiresAt = nextExpiry;
            if (store.touch) await store.touch(currentId, expiresAt);
            else await store.set({ id: currentId, data: structuredCloneSafe(data), ...(principal ? { principal } : {}), createdAt, expiresAt });
            cookies.set(cookieName, signId(currentId, secret), { ...cookieOptions, maxAge: Math.ceil(ttlMs / 1000) });
          }
          cookies.apply(headers);
        }
      };
    },
    async destroy(request, headers, suppliedCookies) {
      const cookies = suppliedCookies ?? new CookieJar(request.headers.get('cookie'));
      const signed = cookies.get(cookieName);
      const id = signed ? verifySignedId(signed, secret) : undefined;
      if (id) await store.delete(id);
      cookies.delete(cookieName, cookieOptions);
      cookies.apply(headers);
    }
  };
}

function signId(id: string, secret: Uint8Array): string {
  const signature = createHmac('sha256', secret).update(id).digest('base64url');
  return `${id}.${signature}`;
}

function verifySignedId(value: string, secret: Uint8Array): string | undefined {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return undefined;
  const id = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1), 'base64url');
  const expected = createHmac('sha256', secret).update(id).digest();
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) return undefined;
  return /^[A-Za-z0-9_-]{32,128}$/.test(id) ? id : undefined;
}

function normalizeSecret(secret: string | Uint8Array): Uint8Array {
  const bytes = typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
  if (bytes.byteLength < 32) throw new TypeError('Session signing secrets must contain at least 32 bytes.');
  return bytes;
}

function randomId(): string { return randomBytes(32).toString('base64url'); }
function structuredCloneSafe<T>(value: T): T { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T; }
function cloneRecord<TData extends Record<string, unknown>>(record: SessionRecord<TData>): SessionRecord<TData> {
  return { ...record, data: structuredCloneSafe(record.data), ...(record.principal ? { principal: { ...record.principal } } : {}) };
}
function withoutName(options: (CookieOptions & { name?: string }) | undefined): CookieOptions {
  if (!options) return {};
  const { name: _name, ...cookie } = options;
  return cookie;
}
