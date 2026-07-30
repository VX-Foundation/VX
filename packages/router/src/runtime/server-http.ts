import type { RuntimeServerRouteRecord } from '../types.js';
import { normalizeRoutePathname } from './search.js';
import type { CachedPage } from './server-contract.js';

export function normalizeEndpointResponse(value: unknown): Response {
  if (value instanceof Response) return withSecurityHeaders(value);
  if (value === undefined) return new Response(null, { status: 204, headers: securityHeaders({ 'cache-control': 'no-store' }) });
  if (typeof value === 'string' || value instanceof Uint8Array) return new Response(value as unknown as BodyInit, { status: 200, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }) });
  return new Response(JSON.stringify(value), { status: 200, headers: securityHeaders({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }) });
}

export function withSecurityHeaders(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: securityHeaders(response.headers)
  });
}

export function methodNotAllowed(allow: string): Response {
  return new Response('Method Not Allowed', { status: 405, headers: securityHeaders({ allow, 'content-type': 'text/plain; charset=utf-8' }) });
}

export function securityHeaders(initial: HeadersInit): Headers {
  const headers = new Headers(initial);
  if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('referrer-policy')) headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (!headers.has('x-frame-options')) headers.set('x-frame-options', 'DENY');
  if (!headers.has('permissions-policy')) headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (!headers.has('cross-origin-opener-policy')) headers.set('cross-origin-opener-policy', 'same-origin');
  if (!headers.has('cross-origin-resource-policy')) headers.set('cross-origin-resource-policy', 'same-origin');
  if (!headers.has('origin-agent-cluster')) headers.set('origin-agent-cluster', '?1');
  if (!headers.has('x-permitted-cross-domain-policies')) headers.set('x-permitted-cross-domain-policies', 'none');
  return headers;
}

export function isCacheFresh(entry: CachedPage, mode: RuntimeServerRouteRecord['policy']['generation']['mode'], revalidateSeconds: number | undefined): boolean {
  if (mode === 'static') return true;
  if (mode !== 'incremental' || !revalidateSeconds) return false;
  return Date.now() - entry.createdAt < revalidateSeconds * 1000;
}

export function cachedResponse(entry: CachedPage, head: boolean, status: 'hit' | 'miss'): Response {
  const headers = new Headers(entry.headers);
  headers.set('x-vx-cache', status);
  return new Response(head ? null : entry.body, { status: entry.status, headers });
}

export function normalizeBasePath(value: string | undefined): string {
  if (!value || value === '/') return '';
  const normalized = normalizeRoutePathname(value, 'never');
  return normalized === '/' ? '' : normalized;
}

export function stripBasePath(pathname: string, basePath: string): string | undefined {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : undefined;
}

export function withBasePath(pathname: string, basePath: string): string {
  if (!basePath || !pathname.startsWith('/')) return pathname;
  return pathname === '/' ? basePath || '/' : `${basePath}${pathname}`;
}

export function resolveRedirect(target: string, current: URL, basePath: string): string {
  if (!target.startsWith('/')) return new URL(target, current).href;
  return withBasePath(target, basePath);
}

export function interpolateRedirect(template: string, params: Readonly<Record<string, unknown>>): string {
  return template.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => encodeURIComponent(String(params[name] ?? '')));
}

export function selectNotFoundRoute(pathname: string, routes: readonly RuntimeServerRouteRecord[]): RuntimeServerRouteRecord | undefined {
  return [...routes]
    .filter((route) => route.loadNotFound && pathname.startsWith(parentPath(route.path)))
    .sort((left, right) => right.path.length - left.path.length)[0] ?? routes.find((route) => route.loadNotFound);
}

export function parentPath(routePath: string): string {
  const segments = routePath.split('/').filter(Boolean);
  segments.pop();
  return `/${segments.join('/')}`;
}

export function publicRouteError(error: unknown): Readonly<Record<string, string>> {
  return Object.freeze({ name: error instanceof Error ? error.name : 'Error', message: 'The route could not be rendered.' });
}

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


export const FORM_FLASH_COOKIE = '__vx_form_flash';
export const CSRF_BINDING_COOKIE = '__vx_csrf_binding';

export function acceptsHtml(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('text/html');
}

export function requestCookie(request: Request, name: string): string | undefined {
  for (const entry of (request.headers.get('cookie') ?? '').split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(entry.slice(separator + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}


export function csrfBindingCookie(binding: string, url: URL, basePath: string): string {
  const parts = [`${CSRF_BINDING_COOKIE}=${encodeURIComponent(binding)}`, `Path=${basePath || '/'}`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=86400'];
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

export function withCookie(response: Response, cookie: string | undefined): Response {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append('set-cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function formFlashCookie(token: string, url: URL, basePath: string, ttlMs: number): string {
  const parts = [`${FORM_FLASH_COOKIE}=${encodeURIComponent(token)}`, `Path=${basePath || '/'}`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(1, Math.ceil(ttlMs / 1_000))}`];
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

export function withClearedFormFlashCookie(response: Response, url: URL, basePath: string): Response {
  const headers = new Headers(response.headers);
  headers.append('set-cookie', `${FORM_FLASH_COOKIE}=; Path=${basePath || '/'}; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function formFlashValues(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const visit = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(visit);
    if (!entry || typeof entry !== 'object') return entry;
    if (typeof (entry as { name?: unknown }).name === 'string' && typeof (entry as { size?: unknown }).size === 'number') return null;
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(entry as Record<string, unknown>)) output[key] = visit(item);
    return output;
  };
  return Object.freeze(visit(value) as Record<string, unknown>);
}

export function defaultContentSecurityPolicy(nonce?: string): string {
  const script = nonce ? `script-src 'self' 'nonce-${nonce}'` : "script-src 'self'";
  return [
    "default-src 'self'",
    script,
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-elem 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

export function createNonce(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
