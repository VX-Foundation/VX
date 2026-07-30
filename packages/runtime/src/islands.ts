import { QueryClient } from './query/client.js';
import { hydrateQueryClient } from './query/serialization.js';
import { StoreRegistry } from './store/registry.js';
import {
  createRangeHydrationRegistry,
  observeExternalDOMMutations,
  type ClientHydrationState,
  type HydrationDiagnostic,
  type HydrationRecoveryMode
} from './hydration.js';

export type IslandHydrationStrategy = 'load' | 'lazy' | 'idle' | 'visible' | 'interaction';

export interface HydrationIslandState {
  id: string;
  moduleId: string;
  strategy: IslandHydrationStrategy;
  props: unknown;
}

export interface HydratableComponentModule {
  __vxComponent?: Readonly<{ id: string; interactive: boolean }>;
  createComponent?: (
    props?: Readonly<Record<string, unknown>>,
    runtime?: Readonly<Record<string, unknown>>
  ) => { node: DocumentFragment; mount?(): void; dispose(): void };
}

export interface IslandHydrationOptions {
  root: Element;
  state: ClientHydrationState;
  modules: Readonly<Record<string, () => Promise<HydratableComponentModule>>>;
  runtime?: Readonly<Record<string, unknown>>;
  recovery?: HydrationRecoveryMode;
  onError?: (error: unknown, island: HydrationIslandState) => void;
  onDiagnostic?: (diagnostic: HydrationDiagnostic, island: HydrationIslandState) => void;
}

/** Hydrates only top-level interactive islands and leaves static server DOM untouched. */
export async function hydrateIslands(options: IslandHydrationOptions): Promise<() => void> {
  const islands = normalizeIslands(options.state.islands);
  if (islands.length === 0) return () => undefined;
  const ranges = findIslandRanges(options.root);
  const instances = new Map<string, { dispose(): void }>();
  const cleanup: Array<() => void> = [];
  const initial: Promise<void>[] = [];
  const moduleCache = new Map<string, Promise<HydratableComponentModule>>();
  const runtime = options.runtime ?? createDefaultRuntime(options.state);
  const ownsRuntime = !options.runtime;
  let disposed = false;

  for (const island of islands) {
    const range = ranges.get(island.id);
    if (!range || range.depth > 0) continue;
    let activation: Promise<void> | undefined;
    const activate = (replay?: EventSnapshot): Promise<void> => {
      if (disposed || instances.has(island.id)) return Promise.resolve();
      if (activation) return activation;
      activation = (async () => {
        const backup = cloneRangeContents(range.start, range.end);
        const stopExternalObservation = observeExternalDOMMutations(range.start.parentNode!, (diagnostic) => options.onDiagnostic?.(diagnostic, island));
        try {
          const module = await resolveModule(island.moduleId, options.modules, moduleCache);
          if (disposed) return;
          if (!module.createComponent) throw new TypeError(`Hydration module '${island.moduleId}' does not export createComponent().`);
          const registry = createRangeHydrationRegistry(range.start, range.end, {
            recovery: options.recovery ?? 'patch',
            onDiagnostic: (diagnostic) => options.onDiagnostic?.(diagnostic, island),
            tolerateExternalMutations: true
          });
          const instance = module.createComponent(asProps(island.props), Object.freeze({ ...runtime, hydration: registry }));
          registry.finalize();
          removeRangeContents(range.start, range.end);
          range.end.parentNode?.insertBefore(instance.node, range.end);
          instance.mount?.();
          registry.dispose();
          instances.set(island.id, instance);
          if (replay) replayEvent(replay, range);
        } catch (error) {
          restoreRangeContents(range.start, range.end, backup);
          options.onError?.(error, island);
        } finally {
          stopExternalObservation();
        }
      })();
      return activation;
    };
    if (island.strategy === 'load') initial.push(activate());
    else cleanup.push(scheduleIsland(island.strategy, range, activate));
  }
  await Promise.all(initial);

  return () => {
    if (disposed) return;
    disposed = true;
    for (const stop of cleanup.splice(0)) stop();
    for (const instance of instances.values()) instance.dispose();
    instances.clear();
    if (ownsRuntime) {
      const queryClient = runtime['queryClient'];
      const stores = runtime['stores'];
      if (queryClient instanceof QueryClient) queryClient.dispose();
      if (stores instanceof StoreRegistry) stores.dispose();
    }
  };
}

interface IslandRange { start: Comment; end: Comment; depth: number }

interface EventSnapshot {
  type: string;
  targetPath: number[];
  bubbles: boolean;
  cancelable: boolean;
  composed: boolean;
  key?: string;
  button?: number;
}

function findIslandRanges(root: Element): Map<string, IslandRange> {
  const ranges = new Map<string, IslandRange>();
  const starts: Array<{ id: string; comment: Comment }> = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    const start = comment.data.match(/^vx:island:(.+):start$/);
    if (start) { starts.push({ id: start[1]!, comment }); continue; }
    const end = comment.data.match(/^vx:island:(.+):end$/);
    if (!end) continue;
    const index = starts.map((entry) => entry.id).lastIndexOf(end[1]!);
    if (index < 0) continue;
    const entry = starts[index]!;
    ranges.set(entry.id, { start: entry.comment, end: comment, depth: index });
    starts.splice(index, 1);
  }
  return ranges;
}

function scheduleIsland(
  strategy: IslandHydrationStrategy,
  range: IslandRange,
  activate: (replay?: EventSnapshot) => Promise<void>
): () => void {
  if (strategy === 'idle' || strategy === 'lazy') {
    const global = window as Window & { requestIdleCallback?: (callback: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (global.requestIdleCallback) {
      const id = global.requestIdleCallback(() => { void activate(); });
      return () => global.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => { void activate(); }, strategy === 'lazy' ? 32 : 1);
    return () => window.clearTimeout(id);
  }
  const target = firstElement(range.start, range.end);
  if (strategy === 'visible') {
    if (target && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void activate(); }
      });
      observer.observe(target);
      return () => observer.disconnect();
    }
    void activate();
    return () => undefined;
  }
  if (strategy === 'interaction') {
    const parent = range.start.parentNode;
    if (!parent) return () => undefined;
    const listener = (event: Event): void => {
      const targetNode = event.target;
      if (!(targetNode instanceof Node) || !isBetween(targetNode, range.start, range.end)) return;
      const snapshot = snapshotEvent(event, targetNode, range);
      if (event.cancelable && ['click', 'submit', 'keydown'].includes(event.type)) event.preventDefault();
      removeInteractionListeners(parent, listener);
      void activate(snapshot);
    };
    for (const event of ['pointerdown', 'click', 'keydown', 'input', 'change', 'submit', 'focusin']) {
      parent.addEventListener(event, listener, true);
    }
    return () => removeInteractionListeners(parent, listener);
  }
  void activate();
  return () => undefined;
}

function removeInteractionListeners(parent: Node, listener: EventListener): void {
  for (const event of ['pointerdown', 'click', 'keydown', 'input', 'change', 'submit', 'focusin']) {
    parent.removeEventListener(event, listener, true);
  }
}

async function resolveModule(
  moduleId: string,
  loaders: Readonly<Record<string, () => Promise<HydratableComponentModule>>>,
  cache: Map<string, Promise<HydratableComponentModule>>
): Promise<HydratableComponentModule> {
  for (const [path, loader] of Object.entries(loaders).sort(([left], [right]) => left.localeCompare(right))) {
    let pending = cache.get(path);
    if (!pending) { pending = loader(); cache.set(path, pending); }
    const module = await pending;
    if (module.__vxComponent?.id === moduleId) return module;
  }
  throw new Error(`Unable to resolve hydration island module '${moduleId}'.`);
}

function createDefaultRuntime(state: ClientHydrationState): Readonly<Record<string, unknown>> {
  const queryClient = new QueryClient();
  if (state.queries) hydrateQueryClient(queryClient, state.queries as never);
  return Object.freeze({ queryClient, stores: new StoreRegistry() });
}

function normalizeIslands(value: ClientHydrationState['islands']): HydrationIslandState[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is HydrationIslandState => {
    if (!isRecord(item)) return false;
    return typeof item['id'] === 'string' && typeof item['moduleId'] === 'string' &&
      ['load', 'lazy', 'idle', 'visible', 'interaction'].includes(String(item['strategy']));
  });
}

function cloneRangeContents(start: Comment, end: Comment): DocumentFragment {
  const range = start.ownerDocument.createRange();
  range.setStartAfter(start);
  range.setEndBefore(end);
  return range.cloneContents();
}

function restoreRangeContents(start: Comment, end: Comment, backup: DocumentFragment): void {
  removeRangeContents(start, end);
  end.parentNode?.insertBefore(backup, end);
}

function snapshotEvent(event: Event, target: Node, range: IslandRange): EventSnapshot {
  return {
    type: event.type,
    targetPath: pathWithinRange(target, range),
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
    ...(event instanceof KeyboardEvent ? { key: event.key } : {}),
    ...(event instanceof MouseEvent ? { button: event.button } : {})
  };
}

function replayEvent(snapshot: EventSnapshot, range: IslandRange): void {
  const roots = nodesBetween(range.start, range.end);
  let target: Node | undefined = roots[snapshot.targetPath[0] ?? -1];
  for (const index of snapshot.targetPath.slice(1)) target = target?.childNodes[index];
  if (!(target instanceof EventTarget)) return;
  const init: EventInit = { bubbles: snapshot.bubbles, cancelable: snapshot.cancelable, composed: snapshot.composed };
  const event = snapshot.key !== undefined
    ? new KeyboardEvent(snapshot.type, { ...init, key: snapshot.key })
    : snapshot.button !== undefined
      ? new MouseEvent(snapshot.type, { ...init, button: snapshot.button })
      : new Event(snapshot.type, init);
  target.dispatchEvent(event);
}

function pathWithinRange(target: Node, range: IslandRange): number[] {
  const roots = nodesBetween(range.start, range.end);
  let current: Node | null = target;
  const path: number[] = [];
  while (current && current.parentNode && current.parentNode !== range.start.parentNode) {
    path.unshift(Array.prototype.indexOf.call(current.parentNode.childNodes, current));
    current = current.parentNode;
  }
  path.unshift(roots.indexOf(current!));
  return path;
}

function asProps(value: unknown): Readonly<Record<string, unknown>> { return isRecord(value) ? value : Object.freeze({}); }
function firstElement(start: Comment, end: Comment): Element | undefined {
  for (let node = start.nextSibling; node && node !== end; node = node.nextSibling) if (node instanceof Element) return node;
  return undefined;
}
function nodesBetween(start: Comment, end: Comment): Node[] {
  const nodes: Node[] = [];
  for (let node = start.nextSibling; node && node !== end; node = node.nextSibling) nodes.push(node);
  return nodes;
}
function removeRangeContents(start: Comment, end: Comment): void {
  let node = start.nextSibling;
  while (node && node !== end) { const next = node.nextSibling; node.parentNode?.removeChild(node); node = next; }
}
function isBetween(node: Node, start: Comment, end: Comment): boolean {
  const parent = start.parentNode;
  if (!parent || end.parentNode !== parent || !parent.contains(node)) return false;
  let cursor: Node | null = node;
  while (cursor && cursor.parentNode !== parent) cursor = cursor.parentNode;
  for (let item = start.nextSibling; item && item !== end; item = item.nextSibling) if (item === cursor) return true;
  return false;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
