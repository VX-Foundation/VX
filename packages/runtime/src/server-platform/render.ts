import { dehydrateQueryClient } from '../query/serialization.js';
import type { QueryDescriptor, QueryPolicy, QuerySnapshot } from '../query/types.js';
import type { RequestRuntime } from '../request-runtime.js';
import { serializeServerValue } from './serialization.js';
import { isURLAttribute, sanitizeURLAttribute, secureExternalRelation } from '../security/url.js';
import type { DOMNamespace } from '../dom-target.js';
import { createCleanupStack, disposeCleanupStack } from '../ownership.js';

export type HydrationMode = 'full' | 'islands' | 'none';
export type StreamingMode = 'blocking' | 'stream';
export type IslandHydrationStrategy = 'load' | 'lazy' | 'idle' | 'visible' | 'interaction';

export interface ServerRenderContextOptions {
  runtime: RequestRuntime;
  routeId: string;
  requestURL: URL;
  hydration?: HydrationMode;
  streaming?: StreamingMode;
  nonce?: string;
  csrfToken?: string;
  formStates?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

export interface HydrationIsland {
  id: string;
  moduleId: string;
  strategy: IslandHydrationStrategy;
  props: unknown;
}

export interface ResumableBoundary {
  id: string;
  moduleId: string;
  state: unknown;
}

interface DeferredBoundary {
  id: string;
  promise: Promise<string>;
}

export interface ServerRenderContext {
  runtime: RequestRuntime;
  routeId: string;
  requestURL: URL;
  hydration: HydrationMode;
  streaming: StreamingMode;
  nonce?: string;
  csrfToken?: string;
  formStates?: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
  islands: HydrationIsland[];
  resumable: ResumableBoundary[];
  deferred: DeferredBoundary[];
  query<TInput, TData>(descriptor: QueryDescriptor<TInput, TData>, input: TInput): ServerQueryResource<TData>;
  registerIsland(moduleId: string, props: unknown, strategy?: IslandHydrationStrategy): string;
  registerResumableBoundary(moduleId: string, state: unknown): string;
  defer(id: string, promise: Promise<string>): void;
  onCleanup(cleanup: () => void): void;
  dispose(): void;
}

export interface ServerQueryResource<TData> {
  readonly status: QuerySnapshot<TData>['status'];
  readonly data: TData | undefined;
  readonly error: QuerySnapshot<TData>['error'];
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly stale: boolean;
  readonly pending?: Promise<TData>;
}

export interface ServerResourceHint {
  relation: 'modulepreload' | 'preload' | 'prefetch';
  href: string;
  as?: 'script' | 'style' | 'font' | 'image' | 'video' | 'audio' | 'worker' | 'fetch';
  type?: string;
  crossOrigin?: 'anonymous';
  integrity?: string;
}

export interface ServerStyleAsset {
  href: string;
  integrity?: string;
  crossOrigin?: 'anonymous';
}

export interface RenderDocumentOptions {
  context: ServerRenderContext;
  html: string;
  head?: string;
  language?: string;
  title?: string;
  csrfToken?: string;
  clientEntry?: string;
  clientEntryIntegrity?: string;
  styles?: readonly string[];
  styleAssets?: readonly ServerStyleAsset[];
  resourceHints?: readonly ServerResourceHint[];
  status?: number;
  headers?: HeadersInit;
  onComplete?: () => void;
}

export interface RenderedDocument {
  status: number;
  headers: Headers;
  html: string;
  stream?: ReadableStream<Uint8Array>;
}

export function createServerRenderContext(options: ServerRenderContextOptions): ServerRenderContext {
  const islands: HydrationIsland[] = [];
  const resumable: ResumableBoundary[] = [];
  const deferred: DeferredBoundary[] = [];
  let islandId = 0;
  let resumableId = 0;
  let disposed = false;
  const cleanups = createCleanupStack(`server-render:${options.routeId}`);
  const context: ServerRenderContext = {
    runtime: options.runtime,
    routeId: options.routeId,
    requestURL: options.requestURL,
    hydration: options.hydration ?? 'islands',
    streaming: options.streaming ?? 'blocking',
    ...(options.nonce ? { nonce: options.nonce } : {}),
    ...(options.csrfToken ? { csrfToken: options.csrfToken } : {}),
    formStates: Object.freeze({ ...(options.formStates ?? {}) }),
    ...(options.signal ? { signal: options.signal } : {}),
    islands,
    resumable,
    deferred,
    query<TInput, TData>(descriptor: QueryDescriptor<TInput, TData>, input: TInput) {
      return createServerQueryResource(context, descriptor, input);
    },
    registerIsland(moduleId, props, strategy = 'load') {
      const id = `vxi-${context.routeId.replace(/[^A-Za-z0-9_-]/g, '-')}-${islandId++}`;
      islands.push({ id, moduleId, strategy, props });
      return id;
    },
    registerResumableBoundary(moduleId, state) {
      const id = `vxr-${context.routeId.replace(/[^A-Za-z0-9_-]/g, '-')}-${resumableId++}`;
      resumable.push({ id, moduleId, state });
      return id;
    },
    defer(id, promise) {
      if (disposed) throw new Error('Cannot defer work after the VX server render context has been disposed.');
      if (deferred.some((entry) => entry.id === id)) throw new Error(`Duplicate VX streaming boundary '${id}'.`);
      deferred.push({ id, promise });
    },
    onCleanup(cleanup) {
      if (disposed) { cleanup(); return; }
      cleanups.push(cleanup);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeCleanupStack(cleanups);
    }
  };
  return context;
}

export function renderText(value: unknown): string {
  return escapeHtml(value == null ? '' : String(value));
}

export function renderElement(
  tagName: string,
  attributes: Readonly<Record<string, unknown>>,
  children: string,
  sourceId?: string,
  widgetName?: string,
  namespace?: DOMNamespace
): string {
  const tag = validateTagName(tagName, namespace);
  const merged: Record<string, unknown> = { ...attributes };
  applyServerWidgetDefaults(tag, widgetName, merged);
  if (sourceId) merged['data-vx-source'] = sourceId;
  if (widgetName) merged['data-vx-widget'] = widgetName;
  if (merged['target'] === '_blank') merged['rel'] = secureExternalRelation(merged['rel']);
  const serialized = Object.entries(merged)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => renderAttribute(name, value, tag))
    .filter(Boolean)
    .join('');
  if (VOID_ELEMENTS.has(tag)) return `<${tag}${serialized}>`;
  return `<${tag}${serialized}>${children}</${tag}>`;
}

export function renderAttribute(name: string, value: unknown, tagName?: string): string {
  const normalized = normalizeAttributeName(name);
  if (!normalized || value === undefined || value === null || value === false) return '';
  if (isURLAttribute(normalized)) {
    const safe = sanitizeURLAttribute(value, { attribute: normalized, ...(tagName ? { tagName } : {}) });
    if (safe === undefined) return '';
    value = safe;
  }
  if (value === true) return ` ${normalized}`;
  if (typeof value === 'object') {
    if (normalized === 'style' && isRecord(value)) return ` style="${escapeAttribute(renderStyle(value))}"`;
    return ` ${normalized}="${escapeAttribute(JSON.stringify(value))}"`;
  }
  return ` ${normalized}="${escapeAttribute(String(value))}"`;
}

export function renderComment(value: string): string {
  return `<!--${value.replace(/--/g, '—')}-->`;
}

export function renderStructuralRange(kind: string, id: string, html: string): string {
  return `${renderComment(`vx:${kind}:${id}:start`)}${html}${renderComment(`vx:${kind}:${id}:end`)}`;
}

export function renderResumableBoundary(
  context: ServerRenderContext,
  moduleId: string,
  state: unknown,
  html: string
): string {
  if (context.hydration === 'none') return html;
  const id = context.registerResumableBoundary(moduleId, state);
  return `${renderComment(`vx:resume:${id}:start`)}${html}${renderComment(`vx:resume:${id}:end`)}`;
}

export function renderIsland(
  context: ServerRenderContext,
  moduleId: string,
  props: unknown,
  html: string,
  strategy: IslandHydrationStrategy = 'load'
): string {
  if (context.hydration === 'none') return html;
  const id = context.registerIsland(moduleId, props, strategy);
  return `${renderComment(`vx:island:${id}:start`)}${html}${renderComment(`vx:island:${id}:end`)}`;
}

export function renderContent(
  providers: Readonly<Record<string, unknown>>,
  name: string,
  context: ServerRenderContext
): Promise<string> {
  const provider = providers[name];
  if (!provider) return Promise.resolve('');
  const list = Array.isArray(provider) ? provider : [provider];
  return Promise.all(list.map(async (item) => {
    if (typeof item !== 'function') throw new TypeError(`VX content provider '${name}' is not callable.`);
    return String(await item(context));
  })).then((parts) => parts.join(''));
}

export async function renderCollection<T>(
  context: ServerRenderContext,
  sourceId: string,
  input: unknown,
  renderItem: (item: T, index: number) => string | Promise<string>,
  fallbacks: {
    loading?: () => string | Promise<string>;
    empty?: () => string | Promise<string>;
    error?: (error: unknown) => string | Promise<string>;
  } = {}
): Promise<string> {
  const resource = asServerResource<T>(input);
  if (resource?.pending && context.streaming === 'stream') {
    const fallback = fallbacks.loading ? await fallbacks.loading() : '';
    context.defer(sourceId, resource.pending.then(
      () => renderCollection(context, sourceId, resource.data ?? [], renderItem, fallbacks),
      (cause) => fallbacks.error ? fallbacks.error(resource.error ?? cause) : ''
    ));
    return renderStructuralRange('stream', sourceId, fallback);
  }
  if (resource?.pending) {
    try { await resource.pending; } catch { /* rendered through resource.error */ }
  }
  if (resource?.error) return fallbacks.error ? await fallbacks.error(resource.error) : '';
  const source = resource ? resource.data : input;
  if (source === undefined || source === null) {
    const fallback = resource?.loading && fallbacks.loading ? await fallbacks.loading() : fallbacks.empty ? await fallbacks.empty() : '';
    return fallback;
  }
  if (!isIterable(source)) throw new TypeError('VX server collection input must be iterable or a query resource.');
  const values = [...source] as T[];
  if (values.length === 0) return fallbacks.empty ? await fallbacks.empty() : '';
  const html = (await Promise.all(values.map((item, index) => renderItem(item, index)))).join('');
  return html;
}

export function renderDocument(options: RenderDocumentOptions): RenderedDocument {
  const context = options.context;
  const head = buildHead(options);
  const nonceAttribute = context.nonce ? ` nonce="${escapeAttribute(context.nonce)}"` : '';
  const streamBootstrap = context.streaming === 'stream' && context.nonce ? createStreamBootstrap(context.nonce) : '';
  const opening = `<!doctype html><html lang="${escapeAttribute(options.language ?? 'en')}"><head>${head}${streamBootstrap}</head><body><main id="vx-app" data-vx-ssr="${escapeAttribute(context.routeId)}">`;
  const closing = (): string => {
    const state = serializeServerValue({
      routeId: context.routeId,
      url: context.requestURL.href,
      hydration: context.hydration,
      queries: dehydrateQueryClient(context.runtime.queryClient),
      islands: context.islands,
      resumable: context.resumable,
      forms: context.formStates
    });
    const stateScript = context.hydration === 'none' ? '' : `<script type="application/json" id="__VX_STATE__"${nonceAttribute}>${state}</script>`;
    const clientScript = context.hydration === 'none' || !options.clientEntry
      ? ''
      : `<script type="module" src="${escapeAttribute(options.clientEntry)}"${options.clientEntryIntegrity ? ` integrity="${escapeAttribute(options.clientEntryIntegrity)}" crossorigin="anonymous"` : ''}${nonceAttribute}></script>`;
    return `</main>${stateScript}${clientScript}</body></html>`;
  };
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
  if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff');

  if (context.streaming === 'stream' && context.deferred.length > 0) {
    return {
      status: options.status ?? 200,
      headers,
      html: `${opening}${options.html}${closing()}`,
      stream: createDocumentStream(opening, options.html, closing, context.deferred, context.nonce, context.signal, options.onComplete)
    };
  }
  return { status: options.status ?? 200, headers, html: `${opening}${options.html}${closing()}` };
}

function createStreamBootstrap(nonce?: string): string {
  const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
  const code = `(()=>{const a=s=>{try{const e=JSON.parse(s.textContent||'{}');const p=e&&e.version===1?e.value:null;if(!p||typeof p.id!=='string'){s.remove();return}if(typeof p.html==='string'){const w=document.createTreeWalker(document,NodeFilter.SHOW_COMMENT);let b=null,d=null;while(w.nextNode()){const c=w.currentNode;if(c.data==='vx:stream:'+p.id+':start')b=c;if(c.data==='vx:stream:'+p.id+':end'){d=c;break}}if(b&&d&&b.parentNode===d.parentNode){const r=document.createRange();r.setStartAfter(b);r.setEndBefore(d);r.deleteContents();const t=document.createElement('template');t.innerHTML=p.html;d.parentNode.insertBefore(t.content,d)}}s.remove()}catch{s.remove()}};const q=n=>{if(n.nodeType===1){if(n.matches&&n.matches('script[data-vx-stream]'))a(n);if(n.querySelectorAll)n.querySelectorAll('script[data-vx-stream]').forEach(a)}};new MutationObserver(rs=>rs.forEach(r=>r.addedNodes.forEach(q))).observe(document.documentElement,{childList:true,subtree:true});})();`;
  return `<script${nonceAttribute}>${code}</script>`;
}

function createServerQueryResource<TInput, TData>(
  context: ServerRenderContext,
  descriptor: QueryDescriptor<TInput, TData>,
  input: TInput
): ServerQueryResource<TData> {
  let status: QuerySnapshot<TData>['status'] = descriptor.enabled?.() === false ? 'paused' : 'loading';
  let data: TData | undefined;
  let error: QuerySnapshot<TData>['error'];
  if (status === 'paused') {
    return {
      get status() { return status; },
      get data() { return data; },
      get error() { return error; },
      get loading() { return false; },
      get refreshing() { return false; },
      get stale() { return true; }
    };
  }
  const pending = context.runtime.queryClient.prefetch(descriptor, input).then(
    (value) => { data = value; status = 'success'; return value; },
    (cause: unknown) => {
      status = 'error';
      error = { name: cause instanceof Error ? cause.name : 'Error', message: cause instanceof Error ? cause.message : String(cause), retryable: false, cause };
      throw cause;
    }
  );
  return {
    get status() { return status; },
    get data() { return data; },
    get error() { return error; },
    get loading() { return status === 'loading'; },
    get refreshing() { return false; },
    get stale() { return false; },
    pending
  };
}

function createDocumentStream(
  opening: string,
  shell: string,
  closing: () => string,
  deferred: readonly DeferredBoundary[],
  nonce?: string,
  signal?: AbortSignal,
  onComplete?: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let completed = false;
  let cancelled = false;
  let aborted: unknown;
  let terminate = (): void => undefined;
  const termination = new Promise<undefined>((resolve) => { terminate = () => resolve(undefined); });
  const abort = (): void => { aborted = signal?.reason ?? new DOMException('Request aborted.', 'AbortError'); terminate(); };
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const complete = (): void => { if (!completed) { completed = true; onComplete?.(); } };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (aborted) { controller.error(aborted); return; }
        controller.enqueue(encoder.encode(`${opening}${shell}`));
        const pending = deferred.map((boundary, index) => boundary.promise.then(
          (html) => ({ index, id: boundary.id, html }),
          () => ({ index, id: boundary.id, error: true as const })
        ));
        const active = new Map(pending.map((promise, index) => [index, promise]));
        while (active.size > 0) {
          const result = await Promise.race([...active.values(), termination]);
          if (!result) {
            if (aborted && !cancelled) controller.error(aborted);
            return;
          }
          active.delete(result.index);
          const payload = 'html' in result
            ? serializeServerValue({ id: result.id, html: result.html })
            : serializeServerValue({ id: result.id, html: '', error: true });
          const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : '';
          controller.enqueue(encoder.encode(`<script type="application/json" data-vx-stream${nonceAttribute}>${payload}</script>`));
        }
        if (cancelled || aborted) return;
        controller.enqueue(encoder.encode(closing()));
        controller.close();
      } finally {
        signal?.removeEventListener('abort', abort);
        complete();
      }
    },
    cancel() { cancelled = true; terminate(); complete(); }
  });
}

function buildHead(options: RenderDocumentOptions): string {
  const pieces = ['<meta charset="utf-8">', '<meta name="viewport" content="width=device-width,initial-scale=1">'];
  if (options.title) pieces.push(`<title>${escapeHtml(options.title)}</title>`);
  if (options.csrfToken) pieces.push(`<meta name="vx-csrf" content="${escapeAttribute(options.csrfToken)}">`);
  for (const hint of options.resourceHints ?? []) pieces.push(renderResourceHint(hint));
  for (const href of options.styles ?? []) pieces.push(`<link rel="stylesheet" href="${escapeAttribute(href)}">`);
  for (const style of options.styleAssets ?? []) pieces.push(`<link rel="stylesheet" href="${escapeAttribute(style.href)}"${style.integrity ? ` integrity="${escapeAttribute(style.integrity)}" crossorigin="${style.crossOrigin ?? 'anonymous'}"` : ''}>`);
  if (options.head) pieces.push(options.head);
  return pieces.join('');
}


function renderResourceHint(hint: ServerResourceHint): string {
  const attributes = [`rel="${hint.relation}"`, `href="${escapeAttribute(hint.href)}"`];
  if (hint.as) attributes.push(`as="${hint.as}"`);
  if (hint.type) attributes.push(`type="${escapeAttribute(hint.type)}"`);
  if (hint.crossOrigin) attributes.push(`crossorigin="${hint.crossOrigin}"`);
  if (hint.integrity) attributes.push(`integrity="${escapeAttribute(hint.integrity)}"`);
  return `<link ${attributes.join(' ')}>`;
}

function applyServerWidgetDefaults(tag: string, widgetName: string | undefined, attributes: Record<string, unknown>): void {
  if (widgetName === 'Button' && attributes['type'] === undefined) attributes['type'] = 'button';
  if (widgetName === 'Image') {
    if (attributes['loading'] === undefined) attributes['loading'] = 'lazy';
    if (attributes['decoding'] === undefined) attributes['decoding'] = 'async';
    if (attributes['decorative'] === true) {
      attributes['alt'] = '';
      attributes['ariaHidden'] = true;
      attributes['role'] = 'presentation';
    }
    delete attributes['decorative'];
  }
  if (widgetName === 'IFrame') {
    if (attributes['loading'] === undefined) attributes['loading'] = 'lazy';
    if (attributes['referrerPolicy'] === undefined) attributes['referrerPolicy'] = 'strict-origin-when-cross-origin';
    if (attributes['trusted'] === true) delete attributes['sandbox'];
    else if (attributes['sandbox'] === undefined) attributes['sandbox'] = '';
    delete attributes['trusted'];
  }
  if (widgetName === 'Slider') attributes['type'] = 'range';
  if (widgetName === 'Switch') {
    attributes['type'] = 'checkbox';
    if (attributes['role'] === undefined) attributes['role'] = 'switch';
  }
  if (widgetName === 'List' && attributes['role'] === undefined) attributes['role'] = 'list';
  if (widgetName === 'Icon' && attributes['ariaLabel'] === undefined && attributes['ariaLabelledBy'] === undefined) {
    attributes['ariaHidden'] = true;
  }
  if (widgetName === 'Icon') delete attributes['decorative'];
  if (tag === 'a' && attributes['target'] === '_blank') attributes['rel'] = secureExternalRelation(attributes['rel']);
}

function asServerResource<T>(value: unknown): ServerQueryResource<Iterable<T>> | undefined {
  if (!isRecord(value) || !('status' in value) || !('data' in value)) return undefined;
  return value as unknown as ServerQueryResource<Iterable<T>>;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function';
}

function normalizeAttributeName(name: string): string | undefined {
  const map: Record<string, string> = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly', dataTestId: 'data-testid' };
  const normalized = map[name] ?? name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  if (!/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(normalized) || /^on/i.test(normalized)) return undefined;
  return normalized;
}

function validateTagName(value: string, namespace?: DOMNamespace): string {
  const pattern = namespace && namespace !== 'html' ? /^[A-Za-z][A-Za-z0-9._:-]*$/ : /^[a-z][a-z0-9-]*$/;
  if (!pattern.test(value)) throw new TypeError(`Invalid SSR element name '${value}'.`);
  return value;
}

function renderStyle(value: Record<string, unknown>): string {
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .filter(([, item]) => item !== undefined && item !== null)
    .map(([name, item]) => `${name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}:${String(item)}`)
    .join(';');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export type { QueryPolicy };
