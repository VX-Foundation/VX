import type { RouteDataDeclaration, RuntimeRouteRecord, VXRouteComponentInstance, VXRouteComponentModule } from '../types.js';

export interface LoadedRouteModules {
  page?: VXRouteComponentModule;
  layouts: VXRouteComponentModule[];
  byPath: ReadonlyMap<string, VXRouteComponentModule>;
}

export interface MountedRouteBranch {
  dispose(): void;
  contexts: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

export async function loadRouteModules(route: RuntimeRouteRecord, signal?: AbortSignal): Promise<LoadedRouteModules> {
  assertActive(signal);
  const layoutPromises = route.loadLayouts.map((load) => load());
  const pagePromise = route.loadPage?.();
  const [layouts, page] = await Promise.all([
    Promise.all(layoutPromises),
    pagePromise ?? Promise.resolve(undefined)
  ]);
  assertActive(signal);
  const byPath = new Map<string, VXRouteComponentModule>();
  route.layoutPaths.forEach((filePath, index) => {
    const module = layouts[index];
    if (module) byPath.set(filePath, module);
  });
  if (route.pagePath && page) byPath.set(route.pagePath, page);
  return { layouts, ...(page ? { page } : {}), byPath };
}

export function mountRouteModules(
  root: Element,
  route: RuntimeRouteRecord,
  loaded: LoadedRouteModules,
  props: Readonly<Record<string, unknown>>,
  runtime: Readonly<Record<string, unknown>> = {}
): MountedRouteBranch {
  if (!loaded.page) throw new Error(`Route '${route.path}' does not provide a page component.`);
  const contexts = new Map<string, Readonly<Record<string, unknown>>>();
  let child = createInstance(loaded.page, props, runtime, {}, route.pagePath ?? route.path);
  const instances = [child];
  contexts.set(route.pagePath ?? route.path, child.ctx);

  try {
    for (let index = loaded.layouts.length - 1; index >= 0; index -= 1) {
      const module = loaded.layouts[index]!;
      const modulePath = route.layoutPaths[index] ?? `layout:${index}`;
      const projected = child;
      child = createInstance(module, props, runtime, { route: () => ({ node: projected.node, cleanup: projected.dispose }) }, modulePath);
      instances.push(child);
      contexts.set(modulePath, child.ctx);
    }

    root.replaceChildren(child.node);
    for (const instance of instances) instance.mount?.();
    return { dispose: () => child.dispose(), contexts };
  } catch (error) {
    child.dispose();
    throw error;
  }
}

export function mountBoundary(
  root: Element,
  module: VXRouteComponentModule,
  props: Readonly<Record<string, unknown>>,
  runtime: Readonly<Record<string, unknown>> = {}
): () => void {
  const instance = createInstance(module, props, runtime, {}, 'route boundary');
  root.replaceChildren(instance.node);
  instance.mount?.();
  return instance.dispose;
}

export async function preloadRouteData(
  route: RuntimeRouteRecord,
  loaded: LoadedRouteModules,
  props: Readonly<Record<string, unknown>>,
  runtime: Readonly<Record<string, unknown>>,
  signal?: AbortSignal
): Promise<void> {
  const declarations = route.queries;
  if (declarations.length === 0) return;
  const byModule = groupDeclarations(declarations);
  const cleanups: Array<() => void> = [];
  try {
    const requests: Promise<unknown>[] = [];
    for (const [modulePath, queries] of byModule) {
      assertActive(signal);
      const module = loaded.byPath.get(modulePath);
      if (!module?.setup) continue;
      const context = module.setup(props, runtime, {});
      cleanups.push(() => cleanupSetupContext(context));
      for (const query of queries) {
        const resource = context[query.name];
        if (isRefetchable(resource)) requests.push(resource.refetch());
      }
    }
    await Promise.all(requests);
    assertActive(signal);
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
}

export function routeActions(
  route: Pick<RuntimeRouteRecord, 'actions'>,
  mounted: MountedRouteBranch
): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const action of route.actions) {
    const context = mounted.contexts.get(action.modulePath);
    if (context && action.name in context) output[action.name] = context[action.name];
  }
  return Object.freeze(output);
}

function createInstance(
  module: VXRouteComponentModule,
  props: Readonly<Record<string, unknown>>,
  runtime: Readonly<Record<string, unknown>>,
  content: Readonly<Record<string, unknown>>,
  label: string
): VXRouteComponentInstance {
  if (!module.createComponent) throw new TypeError(`VX ${label} does not export createComponent().`);
  return module.createComponent(props, runtime, {}, content);
}

function groupDeclarations(declarations: readonly RouteDataDeclaration[]): Map<string, RouteDataDeclaration[]> {
  const grouped = new Map<string, RouteDataDeclaration[]>();
  for (const declaration of declarations) {
    const current = grouped.get(declaration.modulePath) ?? [];
    current.push(declaration);
    grouped.set(declaration.modulePath, current);
  }
  return grouped;
}

function cleanupSetupContext(context: Readonly<Record<string, unknown>>): void {
  const cleanup = context['__vxCleanup'];
  if (Array.isArray(cleanup)) {
    for (const item of [...cleanup].reverse()) if (typeof item === 'function') item();
  }
}

function isRefetchable(value: unknown): value is { refetch(): Promise<unknown> } {
  return typeof value === 'object' && value !== null && 'refetch' in value && typeof (value as { refetch?: unknown }).refetch === 'function';
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Navigation cancelled.', 'AbortError');
}

