import type {
  NavigationSnapshot,
  RouteCatalog,
  RouteHrefOptions,
  RouteLocation,
  RouteReference,
  RuntimeRouteRecord
} from '../types.js';
import { applyRouteMetadata } from './metadata.js';
import { createRouteLocation, matchRoute, type MatchedRoute } from './matcher.js';
import { createRouteCatalog } from './catalog.js';
import { executeRoutePipeline, isRedirectResult } from './lifecycle.js';
import { decodeRouteSearch, normalizeRoutePathname } from './search.js';
import { loadRouteModules, mountBoundary, mountRouteModules, preloadRouteData, routeActions, type LoadedRouteModules, type MountedRouteBranch } from './module.js';
import { QueryClient, StoreRegistry, createHydrationRegistry, hydrateQueryClient, installStreamingPatches, readHydrationState, runRouteTransition, type DehydratedQueryState, type HydrationRegistry } from '@vx-foundation/runtime/client';
import {
  HISTORY_KEY,
  assertActive,
  closestAnchor,
  createHistoryKey,
  currentHistoryKey,
  ensureHistoryKey,
  findFocusTarget,
  focusElement,
  focusIdentity,
  focusRouteStart,
  interpolateRedirect,
  isRecord,
  isTextControl,
  navigationContext,
  normalizeBasePath,
  resolveURL,
  routeCacheKey,
  routeProps,
  safeDecodeHash,
  selectNotFoundRoute,
  shouldHandleAnchor,
  stripBasePath,
  withBasePath
} from './client-navigation.js';


export interface RouterConfig<T> {
  routes: T[];
  onNavigate: (match: MatchedRoute<T>) => void;
  onNotFound?: (path: string) => void;
}

export interface NavigationOptions {
  replace?: boolean;
  history?: 'push' | 'replace' | 'pop' | 'none';
  state?: unknown;
  bypassBlockers?: boolean;
}

export interface BeforeNavigationContext {
  from: RouteLocation | undefined;
  to: RouteLocation;
  signal: AbortSignal;
  kind: 'push' | 'replace' | 'pop' | 'reload';
  state?: unknown;
}

export type NavigationBlocker = (context: BeforeNavigationContext) => boolean | string | void | Promise<boolean | string | void>;

export interface ApplicationRouterConfig {
  root: Element;
  routes: readonly RuntimeRouteRecord[];
  runtime?: Readonly<Record<string, unknown>>;
  window?: Window;
  document?: Document;
  maxPreservedRoutes?: number;
  basePath?: string;
  adoptServerDocument?: boolean;
  onBeforeNavigate?: (context: BeforeNavigationContext) => boolean | void | Promise<boolean | void>;
  onAfterNavigate?: (location: RouteLocation) => void;
  onBeforeLoad?: (context: BeforeNavigationContext) => void | Promise<void>;
  onAfterLoad?: (location: RouteLocation, data: Readonly<Record<string, unknown>>) => void | Promise<void>;
  confirmNavigation?: (message: string, context: BeforeNavigationContext) => boolean | Promise<boolean>;
  onNotFound?: (url: URL) => void;
  onError?: (error: unknown, location?: RouteLocation) => void;
}

export interface ApplicationRouter {
  readonly current: RouteLocation | undefined;
  readonly actions: Readonly<Record<string, unknown>>;
  readonly routes: RouteCatalog;
  start(): Promise<void>;
  navigate(target: string | URL, options?: NavigationOptions): Promise<void>;
  navigateRoute(route: string | RouteReference, params?: Readonly<Record<string, unknown>>, hrefOptions?: RouteHrefOptions, options?: NavigationOptions): Promise<void>;
  block(blocker: NavigationBlocker): () => void;
  preload(target: string | URL): Promise<void>;
  dispose(): void;
}


interface ActiveRoute {
  key: string;
  data: Readonly<Record<string, unknown>>;
  historyKey: string;
  route: RuntimeRouteRecord;
  location: RouteLocation;
  mounted: MountedRouteBranch;
}

interface PreservedRoute extends ActiveRoute {
  fragment: DocumentFragment;
}

interface PreloadEntry {
  loaded: LoadedRouteModules;
  data: Readonly<Record<string, unknown>>;
  completed: boolean;
}


export function createApplicationRouter(config: ApplicationRouterConfig): ApplicationRouter {
  const windowTarget = config.window ?? window;
  const documentTarget = config.document ?? document;
  const hydrationState = readHydrationState(documentTarget);
  const hydration: HydrationRegistry | undefined = !config.adoptServerDocument && config.root.hasAttribute('data-vx-ssr') ? createHydrationRegistry(config.root) : undefined;
  const suppliedQueryClient = config.runtime?.['queryClient'];
  const suppliedStores = config.runtime?.['stores'];
  const queryClient = suppliedQueryClient instanceof QueryClient ? suppliedQueryClient : new QueryClient();
  const stores = suppliedStores instanceof StoreRegistry ? suppliedStores : new StoreRegistry();
  if (hydrationState?.queries) hydrateQueryClient(queryClient, hydrationState.queries as DehydratedQueryState);
  const runtime = Object.freeze({ ...config.runtime, queryClient, stores, ...(hydration ? { hydration } : {}), ...(hydrationState?.forms ? { formStates: hydrationState.forms } : {}) });
  const stopStreaming = installStreamingPatches(documentTarget);
  let hydrating = Boolean(hydration);
  const maxPreservedRoutes = config.maxPreservedRoutes ?? 20;
  const basePath = normalizeBasePath(config.basePath);
  const catalog = createRouteCatalog(config.routes);
  const blockers = new Set<NavigationBlocker>();
  const preserved = new Map<string, PreservedRoute>();
  const snapshots = new Map<string, NavigationSnapshot>();
  const preloads = new Map<string, Promise<PreloadEntry>>();
  let active: ActiveRoute | undefined;
  let adoptedLocation: RouteLocation | undefined;
  let controller: AbortController | undefined;
  let loadingDispose: (() => void) | undefined;
  let started = false;
  let disposed = false;
  let currentActions: Readonly<Record<string, unknown>> = Object.freeze({});
  let visibleObserver: IntersectionObserver | undefined;

  const router: ApplicationRouter = {
    get current() { return active?.location ?? adoptedLocation; },
    get actions() { return currentActions; },
    get routes() { return catalog; },
    async start() {
      if (started) return;
      assertAvailable();
      started = true;
      installListeners();
      ensureHistoryKey(windowTarget);
      if (config.adoptServerDocument) {
        const url = new URL(windowTarget.location.href);
        const matchedPath = stripBasePath(url.pathname, basePath);
        const match = matchedPath === undefined ? null : matchRoute(matchedPath, config.routes);
        if (match) adoptedLocation = createRouteLocation(match.route, url, match.params);
      } else {
        await navigateInternal(new URL(windowTarget.location.href), { history: 'pop' });
      }
      scheduleConfiguredPreloads();
    },
    navigate(target, options = {}) {
      assertAvailable();
      return navigateInternal(resolveURL(target, windowTarget), options);
    },
    navigateRoute(route, params = {}, hrefOptions = {}, options = {}) {
      assertAvailable();
      const reference = typeof route === 'string' ? catalog.get(route) : route;
      const href = withBasePath(reference.build(params, hrefOptions), basePath);
      return navigateInternal(resolveURL(href, windowTarget), options);
    },
    block(blocker) {
      assertAvailable();
      blockers.add(blocker);
      return () => blockers.delete(blocker);
    },
    preload(target) {
      assertAvailable();
      return preloadURL(resolveURL(target, windowTarget));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller?.abort(new DOMException('Router disposed.', 'AbortError'));
      loadingDispose?.();
      active?.mounted.dispose();
      for (const entry of preserved.values()) entry.mounted.dispose();
      preserved.clear();
      preloads.clear();
      snapshots.clear();
      removeListeners();
      visibleObserver?.disconnect();
      stopStreaming();
      hydration?.dispose();
      if (!(suppliedQueryClient instanceof QueryClient)) queryClient.dispose();
      if (!(suppliedStores instanceof StoreRegistry)) stores.dispose();
      config.root.replaceChildren();
      active = undefined;
      adoptedLocation = undefined;
      currentActions = Object.freeze({});
    }
  };

  return router;

  async function navigateInternal(url: URL, options: NavigationOptions, redirectDepth = 0): Promise<void> {
    if (redirectDepth > 10) throw new Error('VX router detected a redirect loop.');
    if (url.origin !== windowTarget.location.origin) {
      windowTarget.location.assign(url.href);
      return;
    }

    const matchedPath = stripBasePath(url.pathname, basePath);
    const match = matchedPath === undefined ? null : matchRoute(matchedPath, config.routes);
    if (!match) {
      await showNotFound(url, options);
      return;
    }
    const route = match.route;
    const canonicalPath = normalizeRoutePathname(matchedPath!, route.policy.navigation?.trailingSlash ?? 'never');
    if (canonicalPath !== matchedPath) {
      url = new URL(url.href);
      url.pathname = withBasePath(canonicalPath, basePath);
      options = { ...options, history: 'replace', replace: true };
    }
    if (route.policy.redirect) {
      const redirectPath = interpolateRedirect(route.policy.redirect.to, match.params);
      const target = new URL(redirectPath.startsWith('/') ? withBasePath(redirectPath, basePath) : redirectPath, url);
      const redirectOptions: NavigationOptions = {
        ...options,
        replace: route.policy.redirect.replace,
        ...(route.policy.redirect.replace ? { history: 'replace' as const } : options.history ? { history: options.history } : {})
      };
      await navigateInternal(target, redirectOptions, redirectDepth + 1);
      return;
    }
    if (!route.pagePath || !route.loadPage) {
      throw new Error(`Route '${route.path}' has no page component and does not redirect.`);
    }

    const rawLocation = createRouteLocation(route, url, match.params);
    const location: RouteLocation = Object.freeze({ ...rawLocation, searchValues: decodeRouteSearch(rawLocation.search, route.policy.search) });
    controller?.abort(new DOMException('Navigation superseded.', 'AbortError'));
    const navigation = new AbortController();
    controller = navigation;
    let approved: boolean | void;
    try {
      const context = navigationContext(active?.location ?? adoptedLocation, location, navigation.signal, options);
      approved = await config.onBeforeNavigate?.(context);
      if (approved !== false && !options.bypassBlockers) approved = await runBlockers(context);
      if (approved !== false) await config.onBeforeLoad?.(context);
      assertActive(navigation.signal);
    } catch (error) {
      if (navigation.signal.aborted) return;
      config.onError?.(error, location);
      return;
    }
    if (approved === false) {
      if (options.history === 'pop' && active) windowTarget.history.replaceState(windowTarget.history.state, '', active.location.url.href);
      return;
    }

    const key = routeCacheKey(route, location);
    const restored = preserved.get(key);
    if (restored) {
      preserveOrDisposeActive();
      hideLoading();
      preserved.delete(key);
      await commitRouteDOM(route, () => config.root.replaceChildren(restored.fragment), navigation.signal);
      commitHistory(url, options);
      const historyKey = currentHistoryKey(windowTarget);
      active = { key, historyKey, route, location, data: restored.data, mounted: restored.mounted };
      adoptedLocation = undefined;
      currentActions = routeActions(route, restored.mounted);
      applyRouteMetadata(route.policy.metadata, documentTarget);
      announceNavigation(route, location);
      restoreNavigation(location, historyKey, options.history === 'pop');
      observeVisibleAnchors();
      config.onAfterNavigate?.(location);
      return;
    }

    try {
      preserveOrDisposeActive();
      if (!hydrating) await showLoading(route, location, navigation.signal);
      const entry = await getPreloadEntry(route, location, navigation.signal, true);
      if (entry.data && Object.prototype.hasOwnProperty.call(entry.data, '__vxMiddlewareResult')) {
        const result = entry.data['__vxMiddlewareResult'];
        if (result === false) { hideLoading(); return; }
        if (result instanceof Response) {
          const target = result.headers.get('location');
          if (target && result.status >= 300 && result.status < 400) {
            hideLoading();
            await navigateInternal(new URL(target, url), { ...options, history: 'replace', bypassBlockers: true }, redirectDepth + 1);
            return;
          }
          throw new Error(`Client route middleware returned an unsupported Response with status ${result.status}.`);
        }
        if (isRedirectResult(result)) {
          hideLoading();
          const target = new URL(result.redirect.startsWith('/') ? withBasePath(result.redirect, basePath) : result.redirect, url);
          await navigateInternal(target, { ...options, bypassBlockers: true, ...(result.replace === false ? (options.history ? { history: options.history } : {}) : { history: 'replace' as const }) }, redirectDepth + 1);
          return;
        }
      }
      assertActive(navigation.signal);
      hideLoading();
      const props = routeProps(location, entry.data);
      let mounted: MountedRouteBranch | undefined;
      await commitRouteDOM(route, () => { mounted = mountRouteModules(config.root, route, entry.loaded, props, runtime); }, navigation.signal);
      if (!mounted) throw new Error(`Route '${route.path}' did not mount.`);
      completeHydration();
      commitHistory(url, options);
      const historyKey = currentHistoryKey(windowTarget);
      active = { key, historyKey, route, location, data: entry.data, mounted };
      adoptedLocation = undefined;
      currentActions = routeActions(route, mounted);
      applyRouteMetadata(route.policy.metadata, documentTarget);
      announceNavigation(route, location);
      restoreNavigation(location, historyKey, options.history === 'pop');
      observeVisibleAnchors();
      await config.onAfterLoad?.(location, entry.data);
      config.onAfterNavigate?.(location);
    } catch (error) {
      if (navigation.signal.aborted) return;
      hideLoading();
      await showError(route, location, error);
      config.onError?.(error, location);
    }
  }

  async function preloadURL(url: URL): Promise<void> {
    if (url.origin !== windowTarget.location.origin) return;
    const pathname = stripBasePath(url.pathname, basePath);
    const match = pathname === undefined ? null : matchRoute(pathname, config.routes);
    if (!match || match.route.policy.preload === 'none' || match.route.policy.redirect || !match.route.pagePath) return;
    const location = createRouteLocation(match.route, url, match.params);
    await getPreloadEntry(match.route, location, undefined, true);
  }

  function getPreloadEntry(
    route: RuntimeRouteRecord,
    location: RouteLocation,
    signal: AbortSignal | undefined,
    includeData: boolean
  ): Promise<PreloadEntry> {
    const preparedLocation: RouteLocation = location.searchValues
      ? location
      : Object.freeze({ ...location, searchValues: decodeRouteSearch(location.search, route.policy.search) });
    const key = routeCacheKey(route, preparedLocation);
    const existing = preloads.get(key);
    if (existing) return existing.then((entry) => { assertActive(signal); return entry; });
    const task = (async () => {
      const loaded = await loadRouteModules(route, signal);
      let data: Readonly<Record<string, unknown>> = Object.freeze({});
      if (includeData) {
        const pipelineController = signal ? undefined : new AbortController();
        const activeSignal = signal ?? pipelineController!.signal;
        const pipeline = await executeRoutePipeline({ route, location: preparedLocation, signal: activeSignal, runtime });
        data = pipeline.middlewareResult === undefined
          ? pipeline.data
          : Object.freeze({ ...pipeline.data, __vxMiddlewareResult: pipeline.middlewareResult });
        await preloadRouteData(route, loaded, routeProps(preparedLocation, data), runtime, signal);
      }
      return { loaded, data, completed: includeData };
    })();
    preloads.set(key, task);
    task.catch(() => preloads.delete(key));
    return task;
  }

  function completeHydration(): void {
    if (!hydrating) return;
    hydrating = false;
    config.root.removeAttribute('data-vx-ssr');
    hydration?.dispose();
  }

  function preserveOrDisposeActive(): void {
    if (!active) return;
    captureCurrentSnapshot(active);
    if (active.route.policy.preserve.state) {
      const fragment = documentTarget.createDocumentFragment();
      while (config.root.firstChild) fragment.appendChild(config.root.firstChild);
      preserved.set(active.key, { ...active, fragment });
      enforcePreservationLimit();
    } else {
      active.mounted.dispose();
      config.root.replaceChildren();
    }
    active = undefined;
    currentActions = Object.freeze({});
  }

  function enforcePreservationLimit(): void {
    while (preserved.size > maxPreservedRoutes) {
      const firstKey = preserved.keys().next().value as string | undefined;
      if (!firstKey) return;
      const entry = preserved.get(firstKey);
      preserved.delete(firstKey);
      entry?.mounted.dispose();
    }
  }

  async function showLoading(route: RuntimeRouteRecord, location: RouteLocation, signal: AbortSignal): Promise<void> {
    hideLoading();
    if (!route.loadLoading) {
      config.root.replaceChildren();
      return;
    }
    const module = await route.loadLoading();
    assertActive(signal);
    loadingDispose = mountBoundary(config.root, module, routeProps(location), runtime);
  }

  async function showError(route: RuntimeRouteRecord, location: RouteLocation, error: unknown): Promise<void> {
    if (!route.loadError) {
      config.root.replaceChildren();
      return;
    }
    try {
      const module = await route.loadError();
      loadingDispose = mountBoundary(config.root, module, { ...routeProps(location), error }, runtime);
    } catch (boundaryError) {
      config.root.replaceChildren();
      config.onError?.(boundaryError, location);
    }
  }

  async function showNotFound(url: URL, options: NavigationOptions): Promise<void> {
    controller?.abort(new DOMException('Navigation superseded.', 'AbortError'));
    const navigation = new AbortController();
    controller = navigation;
    const logicalPath = stripBasePath(url.pathname, basePath) ?? url.pathname;
    const location: RouteLocation = Object.freeze({
      id: '__vx_not_found__', name: 'not-found', path: logicalPath, pathname: url.pathname,
      search: url.searchParams, searchValues: Object.freeze(Object.fromEntries(url.searchParams.entries())),
      hash: url.hash, params: Object.freeze({}), url
    });
    try {
      const context = navigationContext(active?.location ?? adoptedLocation, location, navigation.signal, options);
      let approved = await config.onBeforeNavigate?.(context);
      if (approved !== false && !options.bypassBlockers) approved = await runBlockers(context);
      if (approved !== false) await config.onBeforeLoad?.(context);
      assertActive(navigation.signal);
      if (approved === false) {
        if (options.history === 'pop' && router.current) windowTarget.history.replaceState(windowTarget.history.state, '', router.current.url.href);
        return;
      }
      hideLoading();
      preserveOrDisposeActive();
      const boundaryRoute = selectNotFoundRoute(logicalPath, config.routes);
      if (boundaryRoute?.loadNotFound) {
        const module = await boundaryRoute.loadNotFound();
        assertActive(navigation.signal);
        loadingDispose = mountBoundary(config.root, module, { path: logicalPath, route: location, url }, runtime);
        applyRouteMetadata(boundaryRoute.policy.metadata, documentTarget);
        announceNavigation(boundaryRoute, location);
      } else {
        config.root.replaceChildren();
        config.onNotFound?.(url);
      }
      assertActive(navigation.signal);
      commitHistory(url, options);
      adoptedLocation = location;
      config.onAfterNavigate?.(location);
    } catch (error) {
      if (navigation.signal.aborted) return;
      config.root.replaceChildren();
      config.onError?.(error, location);
    }
  }

  function hideLoading(): void {
    loadingDispose?.();
    loadingDispose = undefined;
  }

  function captureCurrentSnapshot(entry: ActiveRoute): void {
    const historyKey = entry.historyKey;
    const activeElement = documentTarget.activeElement;
    const snapshot: NavigationSnapshot = {
      key: historyKey,
      scrollX: windowTarget.scrollX,
      scrollY: windowTarget.scrollY
    };
    if (entry.route.policy.preserve.focus && activeElement instanceof HTMLElement && config.root.contains(activeElement)) {
      snapshot.focusedId = focusIdentity(activeElement);
      if (isTextControl(activeElement)) {
        if (activeElement.selectionStart !== null) snapshot.selectionStart = activeElement.selectionStart;
        if (activeElement.selectionEnd !== null) snapshot.selectionEnd = activeElement.selectionEnd;
      }
    }
    snapshots.set(historyKey, snapshot);
  }

  function restoreNavigation(location: RouteLocation, historyKey: string, pop: boolean): void {
    queueMicrotask(() => {
      if (location.hash) {
        const target = documentTarget.getElementById(safeDecodeHash(location.hash));
        target?.scrollIntoView();
        focusElement(target);
        return;
      }
      const snapshot = pop ? snapshots.get(historyKey) : undefined;
      if (snapshot && active?.route.policy.preserve.scroll) windowTarget.scrollTo(snapshot.scrollX, snapshot.scrollY);
      else windowTarget.scrollTo(0, 0);
      if (snapshot?.focusedId && active?.route.policy.preserve.focus) {
        const target = findFocusTarget(snapshot.focusedId, documentTarget);
        focusElement(target);
        if (isTextControl(target) && snapshot.selectionStart !== undefined && snapshot.selectionEnd !== undefined) {
          target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        }
      } else if (active?.route.policy.preserve.focus) {
        focusRouteStart(config.root);
      }
    });
  }

  function commitHistory(url: URL, options: NavigationOptions): void {
    const mode = options.history ?? (options.replace ? 'replace' : 'push');
    if (mode === 'none' || mode === 'pop') return;
    const state = { ...(isRecord(options.state) ? options.state : {}), [HISTORY_KEY]: createHistoryKey() };
    if (mode === 'replace') windowTarget.history.replaceState(state, '', url.href);
    else windowTarget.history.pushState(state, '', url.href);
  }

  function installListeners(): void {
    windowTarget.addEventListener('popstate', onPopState);
    windowTarget.addEventListener('beforeunload', onBeforeUnload);
    if ('scrollRestoration' in windowTarget.history) windowTarget.history.scrollRestoration = 'manual';
    documentTarget.addEventListener('click', onClick);
    documentTarget.addEventListener('pointerover', onIntent);
    documentTarget.addEventListener('focusin', onIntent);
    installVisiblePreloading();
  }

  function removeListeners(): void {
    windowTarget.removeEventListener('popstate', onPopState);
    windowTarget.removeEventListener('beforeunload', onBeforeUnload);
    documentTarget.removeEventListener('click', onClick);
    documentTarget.removeEventListener('pointerover', onIntent);
    documentTarget.removeEventListener('focusin', onIntent);
  }

  function onBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    if (blockers.size === 0) return undefined;
    event.preventDefault();
    event.returnValue = '';
    return '';
  }

  function onPopState(): void {
    scheduleNavigation(new URL(windowTarget.location.href), { history: 'pop' });
  }

  function onClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.defaultPrevented) return;
    const anchor = closestAnchor(event.target);
    if (!shouldHandleAnchor(anchor, windowTarget)) return;
    const url = new URL(anchor!.href);
    if (url.pathname === windowTarget.location.pathname && url.search === windowTarget.location.search && url.hash) return;
    event.preventDefault();
    scheduleNavigation(url, { history: anchor!.hasAttribute('data-vx-replace') ? 'replace' : 'push' });
  }

  function onIntent(event: Event): void {
    const anchor = closestAnchor(event.target);
    if (!shouldHandleAnchor(anchor, windowTarget)) return;
    const url = new URL(anchor!.href);
    const pathname = stripBasePath(url.pathname, basePath);
    const match = pathname === undefined ? null : matchRoute(pathname, config.routes);
    if (match?.route.policy.preload === 'intent' && anchor!.dataset['vxPreload'] !== 'none') schedulePreload(url);
  }

  function installVisiblePreloading(): void {
    const Observer = (windowTarget as Window & { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    if (!Observer) return;
    const observer = new Observer((entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLAnchorElement)) continue;
        const url = new URL(entry.target.href);
        const pathname = stripBasePath(url.pathname, basePath);
        const match = pathname === undefined ? null : matchRoute(pathname, config.routes);
        if (match?.route.policy.preload === 'visible') schedulePreload(url);
        observer.unobserve(entry.target);
      }
    });
    visibleObserver = observer;
    observeVisibleAnchors();
  }

  function observeVisibleAnchors(): void {
    if (!visibleObserver) return;
    for (const anchor of config.root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (anchor.dataset['vxPreload'] !== 'none') visibleObserver.observe(anchor);
    }
  }

  function scheduleConfiguredPreloads(): void {
    for (const route of config.routes) {
      if (route.policy.preload !== 'eager' || route.parameters.length > 0) continue;
      schedulePreload(new URL(withBasePath(route.path, basePath), windowTarget.location.origin));
    }
  }

  function scheduleNavigation(url: URL, options: NavigationOptions): void {
    void navigateInternal(url, options).catch((error) => config.onError?.(error, active?.location));
  }

  function schedulePreload(url: URL): void {
    void preloadURL(url).catch((error) => config.onError?.(error, active?.location));
  }



  async function commitRouteDOM(route: RuntimeRouteRecord, operation: () => void, signal: AbortSignal): Promise<void> {
    await runRouteTransition(operation, {
      skip: !route.policy.navigation?.viewTransition,
      signal,
      document: documentTarget,
      name: route.id
    });
  }

  function announceNavigation(route: RuntimeRouteRecord, location: RouteLocation): void {
    if (route.policy.navigation?.announce === false) return;
    const compatibleDocument = documentTarget as Document & { body?: HTMLElement; getElementById?: (id: string) => HTMLElement | null };
    if (!compatibleDocument.body || typeof compatibleDocument.getElementById !== 'function') return;
    let region = compatibleDocument.getElementById('__vx-route-announcer');
    if (!region) {
      region = documentTarget.createElement('div');
      region.id = '__vx-route-announcer';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.setAttribute('data-vx-router-announcer', '');
      region.setAttribute('style', 'position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap');
      compatibleDocument.body.appendChild(region);
    }
    region.textContent = '';
    queueMicrotask(() => { region!.textContent = documentTarget.title || location.pathname; });
  }

  async function runBlockers(context: BeforeNavigationContext): Promise<boolean> {
    for (const blocker of blockers) {
      const result = await blocker(context);
      assertActive(context.signal);
      if (result === false) return false;
      if (typeof result === 'string') {
        const confirmed = config.confirmNavigation
          ? await config.confirmNavigation(result, context)
          : windowTarget.confirm(result);
        if (!confirmed) return false;
      }
    }
    return true;
  }

  function assertAvailable(): void {
    if (disposed) throw new Error('VX router has been disposed.');
  }
}


/** Original callback router retained for low-level integrations. */
export function initRouter<T extends { path: string }>(config: RouterConfig<T>): () => void {
  function handleLocationChange(): void {
    const path = window.location.pathname;
    const match = matchRoute(path, config.routes);
    if (match) config.onNavigate(match);
    else if (config.onNotFound) config.onNotFound(path);
    else console.error(`[VX Router] No route matched for ${path}`);
  }
  function handleClick(event: MouseEvent): void {
    if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.defaultPrevented) return;
    const anchor = closestAnchor(event.target);
    if (!shouldHandleAnchor(anchor, window)) return;
    event.preventDefault();
    window.history.pushState(null, '', anchor!.href);
    handleLocationChange();
  }
  window.addEventListener('click', handleClick);
  window.addEventListener('popstate', handleLocationChange);
  handleLocationChange();
  return () => {
    window.removeEventListener('click', handleClick);
    window.removeEventListener('popstate', handleLocationChange);
  };
}
