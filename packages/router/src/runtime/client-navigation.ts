import type { RouteLocation, RuntimeRouteRecord } from '../types.js';
import { normalizeRoutePathname } from './search.js';
import type { BeforeNavigationContext, NavigationOptions } from './client.js';

export const HISTORY_KEY = '__vxRouteKey';
const ROUTER_IGNORE = 'data-vx-router-ignore';

export function navigationContext(from: RouteLocation | undefined, to: RouteLocation, signal: AbortSignal, options: NavigationOptions): BeforeNavigationContext {
  const history = options.history ?? (options.replace ? 'replace' : 'push');
  const kind = history === 'pop' ? 'pop' : history === 'replace' ? 'replace' : 'push';
  return { from, to, signal, kind, ...(options.state !== undefined ? { state: options.state } : {}) };
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

export function routeProps(location: RouteLocation, data: Readonly<Record<string, unknown>> = Object.freeze({})): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...location.params, route: location, search: location.searchValues ?? Object.freeze(Object.fromEntries(location.search.entries())), data });
}

export function routeCacheKey(route: RuntimeRouteRecord, location: RouteLocation): string {
  return `${route.id}:${location.pathname}?${location.search.toString()}`;
}

export function interpolateRedirect(target: string, params: Readonly<Record<string, unknown>>): string {
  return target.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new TypeError(`Redirect requires route parameter '${name}'.`);
    if (Array.isArray(value)) return value.map((item) => encodeURIComponent(String(item))).join('/');
    return String(value).split('/').map(encodeURIComponent).join('/');
  });
}

export function selectNotFoundRoute(pathname: string, routes: readonly RuntimeRouteRecord[]): RuntimeRouteRecord | undefined {
  const candidates = routes.filter((route) => route.loadNotFound);
  candidates.sort((left, right) => staticPrefixLength(right) - staticPrefixLength(left));
  return candidates.find((route) => pathname.startsWith(staticPrefix(route))) ?? candidates[0];
}

export function staticPrefixLength(route: RuntimeRouteRecord): number { return staticPrefix(route).length; }
function staticPrefix(route: RuntimeRouteRecord): string {
  const parts = route.segments.filter((segment) => segment.kind === 'static').map((segment) => encodeURIComponent(segment.value));
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

export function shouldHandleAnchor(anchor: HTMLAnchorElement | null, windowTarget: Window): boolean {
  if (!anchor || !anchor.href || anchor.hasAttribute(ROUTER_IGNORE) || anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.rel.split(/\s+/).includes('external')) return false;
  return new URL(anchor.href).origin === windowTarget.location.origin;
}

export function closestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  return target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
}

export function ensureHistoryKey(windowTarget: Window): void {
  if (isRecord(windowTarget.history.state) && typeof windowTarget.history.state[HISTORY_KEY] === 'string') return;
  windowTarget.history.replaceState({ ...(isRecord(windowTarget.history.state) ? windowTarget.history.state : {}), [HISTORY_KEY]: createHistoryKey() }, '', windowTarget.location.href);
}

export function currentHistoryKey(windowTarget: Window): string {
  return isRecord(windowTarget.history.state) && typeof windowTarget.history.state[HISTORY_KEY] === 'string'
    ? windowTarget.history.state[HISTORY_KEY] as string
    : 'initial';
}

export function createHistoryKey(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
export function resolveURL(target: string | URL, windowTarget: Window): URL { return target instanceof URL ? target : new URL(target, windowTarget.location.href); }
export function assertActive(signal?: AbortSignal): void { if (signal?.aborted) throw signal.reason ?? new DOMException('Navigation cancelled.', 'AbortError'); }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export function focusIdentity(element: HTMLElement): string {
  if (element.id) return `id:${element.id}`;
  const name = element.getAttribute('name');
  if (name) return `name:${name}`;
  return '';
}

export function findFocusTarget(identity: string, documentTarget: Document): HTMLElement | null {
  if (identity.startsWith('id:')) return documentTarget.getElementById(identity.slice(3));
  if (identity.startsWith('name:')) return documentTarget.querySelector<HTMLElement>(`[name="${escapeAttribute(identity.slice(5))}"]`);
  return null;
}

export function focusRouteStart(root: Element): void {
  const target = root.querySelector<HTMLElement>('[autofocus], main, h1, [data-vx-route-focus]');
  focusElement(target);
}

export function focusElement(target: HTMLElement | null): void {
  if (!target) return;
  const hadTabIndex = target.hasAttribute('tabindex');
  if (!hadTabIndex && target.tabIndex < 0) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  if (!hadTabIndex) target.removeAttribute('tabindex');
}

export function isTextControl(value: unknown): value is HTMLInputElement | HTMLTextAreaElement {
  return value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement;
}

export function safeDecodeHash(hash: string): string {
  try { return decodeURIComponent(hash.replace(/^#/, '')); } catch { return hash.replace(/^#/, ''); }
}

export function escapeAttribute(value: string): string { return value.replace(/["\\]/g, '\\$&'); }
