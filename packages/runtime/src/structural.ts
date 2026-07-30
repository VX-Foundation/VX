import { effect, state } from './state.js';
import type { StateNode } from './state.js';
import { normalizeTransition, transitionElements as runTransitions, type TransitionController } from './transitions.js';

export type Cleanup = () => void;

export interface MountBlock {
  node: Node;
  cleanup?: Cleanup;
}

export type MountOutput = Node | MountBlock | null;
export type StructuralKey = string | number;

export interface StructuralSelection {
  key: StructuralKey;
  values?: Readonly<Record<string, unknown>>;
}

export interface ViewPatternDescriptor {
  category: 'wildcard' | 'literal' | 'named';
  text: string;
  name?: string;
  binding?: string;
  literal?: string | number | boolean | null;
}

export interface StructuralTransition {
  name: 'none' | 'fade' | 'slide' | 'scale' | string;
  duration?: number;
  delay?: number;
  easing?: string;
  fill?: FillMode;
  enter?: Keyframe[] | PropertyIndexedKeyframes;
  exit?: Keyframe[] | PropertyIndexedKeyframes;
}

export type StructuralTransitionInput = string | StructuralTransition | null | undefined | false;

export interface StructuralScope {
  binding(name: string): StateNode<unknown>;
}

export interface CollectionFallbackRenderers {
  loading?: () => MountOutput;
  empty?: () => MountOutput;
  error?: (error: StateNode<unknown>) => MountOutput;
}

export interface CollectionResource<T> {
  data?: readonly T[] | Iterable<T> | null;
  loading?: boolean;
  error?: unknown;
  status?: string;
}

export type CollectionInput<T> = readonly T[] | Iterable<T> | CollectionResource<T> | null | undefined;

interface ActiveMount {
  key: StructuralKey;
  nodes: Node[];
  scope: BindingScope;
  cleanup?: Cleanup;
}

interface ListEntry<T> {
  nodes: Node[];
  item: StateNode<T>;
  index: StateNode<number>;
  cleanup?: Cleanup;
}

const NO_BRANCH = Symbol('vx-no-branch');

class BindingScope implements StructuralScope {
  private readonly signals = new Map<string, StateNode<unknown>>();

  binding(name: string): StateNode<unknown> {
    let signal = this.signals.get(name);
    if (!signal) {
      signal = state<unknown>(undefined);
      this.signals.set(name, signal);
    }
    return signal;
  }

  update(values: Readonly<Record<string, unknown>> = {}): void {
    const names = new Set([...this.signals.keys(), ...Object.keys(values)]);
    for (const name of names) this.binding(name).value = values[name];
  }

  dispose(): void {
    for (const signal of this.signals.values()) signal.dispose();
    this.signals.clear();
  }
}

/**
 * Mounts exactly one structural branch. The active branch is preserved while
 * its key remains stable; only branch bindings update in that case.
 */
export function structuralMount(
  anchor: Comment,
  select: () => StructuralSelection | null,
  render: (selection: StructuralSelection, scope: StructuralScope) => MountOutput,
  transition?: () => StructuralTransitionInput
): Cleanup {
  let active: ActiveMount | undefined;
  let disposed = false;
  let generation = 0;
  let pendingExit: TransitionController | undefined;

  const unmount = (): void => {
    if (!active) return;
    active.cleanup?.();
    active.scope.dispose();
    removeNodes(active.nodes);
    active = undefined;
  };

  const mount = (selection: StructuralSelection, focus: FocusSnapshot | undefined): void => {
    const parent = anchor.parentNode;
    if (!parent || disposed) return;
    const scope = new BindingScope();
    scope.update(selection.values);
    const output = normalizeMountOutput(render(selection, scope));
    if (!output) {
      scope.dispose();
      return;
    }
    const nodes = collectOutputNodes(output.node);
    parent.insertBefore(output.node, anchor.nextSibling);
    active = {
      key: selection.key,
      nodes,
      scope,
      ...(output.cleanup ? { cleanup: output.cleanup } : {})
    };
    restoreFocus(focus, parent);
    runEnterTransition(nodes, transition?.());
  };

  const replace = (selection: StructuralSelection | null): void => {
    if (active && selection && Object.is(active.key, selection.key)) {
      generation += 1;
      const wasExiting = pendingExit?.state === 'running';
      const reversed = wasExiting ? pendingExit?.reverse() === true : false;
      pendingExit = undefined;
      active.scope.update(selection.values);
      if (wasExiting && !reversed) runEnterTransition(active.nodes, transition?.());
      return;
    }

    const focus = captureFocus(anchor.parentNode);
    const currentGeneration = ++generation;
    pendingExit?.cancel();
    pendingExit = undefined;
    const transitionValue = transition?.();
    const finish = (): void => {
      if (disposed || currentGeneration !== generation) return;
      unmount();
      if (selection) mount(selection, focus);
    };

    if (active && hasTransition(transitionValue)) {
      const execution = startExitTransition(active.nodes, transitionValue);
      if (execution.state === 'finished') {
        finish();
      } else {
        pendingExit = execution;
        void execution.finished.then(() => {
          if (currentGeneration === generation) pendingExit = undefined;
          finish();
        });
      }
    } else {
      finish();
    }
  };

  const subscription = effect(() => replace(select()));
  return () => {
    disposed = true;
    generation += 1;
    pendingExit?.cancel();
    pendingExit = undefined;
    subscription.dispose();
    unmount();
  };
}

/** Compatibility primitive for a single truthy branch. */
export function conditionalMount(
  anchor: Comment,
  condition: () => unknown,
  render: (value: unknown) => MountOutput,
  transition?: () => StructuralTransitionInput
): Cleanup {
  return structuralMount(
    anchor,
    () => {
      const value = condition();
      return value === false || value == null
        ? null
        : { key: 'truthy', values: { value } };
    },
    (_selection, scope) => render(scope.binding('value').value),
    transition
  );
}

/**
 * Direct keyed DOM collection reconciler. Existing entries are moved rather
 * than recreated, so DOM identity, focus, native selection, and component
 * ownership survive insertion and reordering.
 */
export function collectionMount<T>(
  anchor: Comment,
  collection: () => CollectionInput<T>,
  keyOf: (item: T, index: number) => StructuralKey,
  render: (item: StateNode<T>, index: StateNode<number>) => MountOutput,
  fallbacks: CollectionFallbackRenderers = {},
  transition?: () => StructuralTransitionInput
): Cleanup {
  let rendered = new Map<StructuralKey, ListEntry<T>>();
  let fallbackMode: 'loading' | 'empty' | 'error' | typeof NO_BRANCH = NO_BRANCH;
  let fallbackNodes: Node[] = [];
  let fallbackCleanup: Cleanup | undefined;
  let errorSignal: StateNode<unknown> | undefined;

  const clearFallback = (): void => {
    fallbackCleanup?.();
    fallbackCleanup = undefined;
    removeNodes(fallbackNodes);
    fallbackNodes = [];
    errorSignal?.dispose();
    errorSignal = undefined;
    fallbackMode = NO_BRANCH;
  };

  const clearEntries = (): void => {
    for (const entry of rendered.values()) disposeListEntry(entry);
    rendered.clear();
  };

  const mountFallback = (mode: 'loading' | 'empty' | 'error', error: unknown): void => {
    if (fallbackMode === mode) {
      if (mode === 'error' && errorSignal) errorSignal.value = error;
      return;
    }

    const focus = captureFocus(anchor.parentNode);
    clearEntries();
    clearFallback();
    if (!anchor.parentNode) {
      fallbackMode = mode;
      return;
    }

    let output: MountOutput;
    if (mode === 'error') {
      if (!fallbacks.error) {
        fallbackMode = mode;
        return;
      }
      errorSignal = state(error);
      output = fallbacks.error(errorSignal);
    } else if (mode === 'loading') {
      if (!fallbacks.loading) {
        fallbackMode = mode;
        return;
      }
      output = fallbacks.loading();
    } else {
      if (!fallbacks.empty) {
        fallbackMode = mode;
        return;
      }
      output = fallbacks.empty();
    }
    const normalized = normalizeMountOutput(output ?? null);
    fallbackMode = mode;
    if (!normalized) return;
    fallbackCleanup = normalized.cleanup;
    fallbackNodes = collectOutputNodes(normalized.node);
    anchor.parentNode.insertBefore(normalized.node, anchor.nextSibling);
    restoreFocus(focus, anchor.parentNode);
    runEnterTransition(fallbackNodes, transition?.());
  };

  const reconcile = (items: readonly T[]): void => {
    const parent = anchor.parentNode;
    if (!parent) return;
    const focus = captureFocus(parent);
    clearFallback();

    const next = new Map<StructuralKey, ListEntry<T>>();
    const keys = new Set<StructuralKey>();
    const keyedItems = items.map((item, index) => {
      const key = keyOf(item, index);
      assertValidKey(key);
      if (keys.has(key)) throw new Error(`Duplicate VX collection key '${String(key)}'.`);
      keys.add(key);
      return { item, index, key };
    });

    for (const [key, entry] of rendered) {
      if (!keys.has(key)) disposeListEntry(entry);
    }

    let cursor: Node = anchor;
    for (const keyed of keyedItems) {
      const rawItem = keyed.item;
      const index = keyed.index;
      const key = keyed.key;
      let entry = rendered.get(key);
      let created = false;

      if (!entry) {
        const itemSignal = state(rawItem);
        const indexSignal = state(index);
        const output = normalizeMountOutput(render(itemSignal, indexSignal));
        if (!output) continue;
        entry = {
          nodes: collectOutputNodes(output.node),
          item: itemSignal,
          index: indexSignal,
          ...(output.cleanup ? { cleanup: output.cleanup } : {})
        };
        annotateCollectionIdentity(entry.nodes, key);
        created = true;
      } else {
        entry.item.value = rawItem;
        entry.index.value = index;
      }

      const fragment = document.createDocumentFragment();
      for (const node of entry.nodes) fragment.appendChild(node);
      parent.insertBefore(fragment, cursor.nextSibling);
      cursor = entry.nodes.at(-1) ?? cursor;
      next.set(key, entry);
      if (created) runEnterTransition(entry.nodes, transition?.());
    }

    rendered = next;
    restoreFocus(focus, parent);
  };

  const subscription = effect(() => {
    const snapshot = normalizeCollection<T>(collection());
    if (snapshot.mode === 'ready') reconcile(snapshot.items);
    else mountFallback(snapshot.mode, snapshot.error);
  });

  return () => {
    subscription.dispose();
    clearEntries();
    clearFallback();
  };
}

/** Compatibility alias for code compiled before the final collection contract. */
export function listMount<T>(
  anchor: Comment,
  collection: () => readonly T[] | null | undefined,
  keyOf: (item: T, index: number) => StructuralKey,
  render: (item: StateNode<T>, index: StateNode<number>) => MountOutput
): Cleanup {
  return collectionMount(anchor, collection, keyOf, render);
}

export function selectPatternBranch(
  value: unknown,
  patterns: readonly ViewPatternDescriptor[],
  fallbackKey?: StructuralKey
): StructuralSelection | null {
  for (let index = 0; index < patterns.length; index += 1) {
    const match = matchViewPattern(value, patterns[index]!);
    if (match.matched) return { key: index, values: match.bindings };
  }
  return fallbackKey === undefined ? null : { key: fallbackKey };
}

export function matchViewPattern(
  value: unknown,
  pattern: ViewPatternDescriptor
): { matched: boolean; bindings: Readonly<Record<string, unknown>> } {
  if (pattern.category === 'wildcard') return { matched: true, bindings: {} };
  if (pattern.category === 'literal') {
    return { matched: Object.is(value, pattern.literal), bindings: {} };
  }

  const name = pattern.name ?? pattern.text;
  const matched = matchesNamedPattern(value, name);
  if (!matched) return { matched: false, bindings: {} };
  if (!pattern.binding) return { matched: true, bindings: {} };
  return { matched: true, bindings: { [pattern.binding]: extractPatternPayload(value, name) } };
}

export function matchesPattern(value: unknown, pattern: string): boolean {
  return matchViewPattern(value, { category: 'named', name: pattern, text: pattern }).matched;
}

function matchesNamedPattern(value: unknown, name: string): boolean {
  switch (name) {
    case 'String': return typeof value === 'string';
    case 'Int': return typeof value === 'number' && Number.isInteger(value);
    case 'Float':
    case 'Number': return typeof value === 'number';
    case 'Bool':
    case 'Boolean': return typeof value === 'boolean';
    case 'List': return Array.isArray(value);
    case 'List.Empty': return Array.isArray(value) && value.length === 0;
    case 'Map': return value instanceof Map;
    case 'Set': return value instanceof Set;
    case 'None':
    case 'null': return value == null;
    case 'Some': return value != null;
    case 'Loading':
    case 'loading': return readStatus(value) === 'loading' || readBoolean(value, 'loading');
    case 'Error':
    case 'error': return readStatus(value) === 'error' || readProperty(value, 'error') != null;
    case 'Success':
    case 'Ready':
    case 'success':
    case 'ready': return ['success', 'ready'].includes(readStatus(value) ?? '');
    case 'Empty':
    case 'empty': return normalizeCollection(value).mode === 'empty';
    default: {
      if (typeof value !== 'object' || value === null) return false;
      const discriminator = ['kind', 'type', '__typename', 'status', 'state', 'tag']
        .map((property) => readProperty(value, property))
        .find((candidate) => candidate != null);
      return discriminator === name;
    }
  }
}

function extractPatternPayload(value: unknown, name: string): unknown {
  if (name === 'Some') return value;
  if (name === 'Error' || name === 'error') return readProperty(value, 'error') ?? value;
  if (['Success', 'Ready', 'success', 'ready'].includes(name)) {
    return readProperty(value, 'data') ?? readProperty(value, 'value') ?? value;
  }
  return readProperty(value, 'payload') ?? readProperty(value, 'data') ?? readProperty(value, 'value') ?? value;
}

function normalizeCollection<T>(value: unknown):
  | { mode: 'ready'; items: readonly T[]; error?: undefined }
  | { mode: 'loading' | 'empty' | 'error'; items: readonly T[]; error?: unknown } {
  const direct = collectionItems<T>(value);
  if (direct) return direct.length > 0 ? { mode: 'ready', items: direct } : { mode: 'empty', items: direct };

  const data = readProperty(value, 'data');
  const items = collectionItems<T>(data) ?? [];
  if (items.length > 0) return { mode: 'ready', items };

  const loading = readBoolean(value, 'loading') || readStatus(value) === 'loading';
  if (loading) return { mode: 'loading', items };
  const error = readProperty(value, 'error');
  if (error != null || readStatus(value) === 'error') return { mode: 'error', items, error };
  return { mode: 'empty', items };
}

function collectionItems<T>(value: unknown): readonly T[] | undefined {
  if (Array.isArray(value)) return value as readonly T[];
  if (value instanceof Map) return Array.from(value.entries()) as T[];
  if (value instanceof Set) return Array.from(value.values()) as T[];
  if (typeof value === 'object' && value !== null && Symbol.iterator in value) {
    return Array.from(value as Iterable<T>);
  }
  return undefined;
}

function normalizeMountOutput(output: MountOutput): MountBlock | null {
  if (!output) return null;
  if ('node' in output) return output;
  return { node: output };
}

function collectOutputNodes(node: Node): Node[] {
  return node instanceof DocumentFragment ? Array.from(node.childNodes) : [node];
}

function disposeListEntry<T>(entry: ListEntry<T>): void {
  entry.cleanup?.();
  entry.item.dispose();
  entry.index.dispose();
  removeNodes(entry.nodes);
}

function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) node.parentNode?.removeChild(node);
}

function assertValidKey(key: StructuralKey): void {
  if ((typeof key === 'string' && key.length > 0) || (typeof key === 'number' && Number.isFinite(key))) return;
  throw new TypeError('VX collection keys must be non-empty strings or finite numbers.');
}

function annotateCollectionIdentity(nodes: readonly Node[], key: StructuralKey): void {
  const encoded = String(key);
  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    node.setAttribute('data-vx-collection-key', encoded);
    for (const child of node.querySelectorAll('[data-vx-source]')) {
      if (!child.hasAttribute('data-vx-collection-key')) child.setAttribute('data-vx-collection-key', encoded);
    }
  }
}

interface FocusSnapshot {
  source?: string;
  collectionKey?: string;
  id?: string;
  name?: string;
  start?: number | null;
  end?: number | null;
  direction?: 'forward' | 'backward' | 'none' | null;
}

function captureFocus(root: Node | null): FocusSnapshot | undefined {
  if (!root || typeof document === 'undefined') return undefined;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return undefined;
  const selectable = active as HTMLInputElement | HTMLTextAreaElement;
  const source = active.dataset['vxSource'];
  const collectionKey = active.dataset['vxCollectionKey'];
  const id = active.id || undefined;
  const name = active.getAttribute('name') ?? undefined;
  const start = typeof selectable.selectionStart === 'number' ? selectable.selectionStart : undefined;
  const end = typeof selectable.selectionEnd === 'number' ? selectable.selectionEnd : undefined;
  const direction = selectable.selectionDirection;
  return {
    ...(source ? { source } : {}),
    ...(collectionKey ? { collectionKey } : {}),
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(direction !== null ? { direction } : {})
  };
}

function restoreFocus(snapshot: FocusSnapshot | undefined, root: Node): void {
  if (!snapshot || typeof document === 'undefined') return;
  if (document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) return;

  const candidates = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-vx-source], [id], [name]'))]
    : Array.from((root as ParentNode).querySelectorAll?.<HTMLElement>('[data-vx-source], [id], [name]') ?? []);
  const target = candidates.find((candidate) => {
    if (!(candidate instanceof HTMLElement)) return false;
    if (snapshot.collectionKey && candidate.dataset['vxCollectionKey'] !== snapshot.collectionKey) return false;
    if (snapshot.source && candidate.dataset['vxSource'] === snapshot.source) return true;
    if (snapshot.id && candidate.id === snapshot.id) return true;
    return Boolean(snapshot.name && candidate.getAttribute('name') === snapshot.name);
  });
  if (!(target instanceof HTMLElement)) return;
  target.focus({ preventScroll: true });
  if (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    snapshot.start != null && snapshot.end != null
  ) {
    target.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction ?? undefined);
  }
}

function hasTransition(input: StructuralTransitionInput): boolean {
  const resolved = normalizeTransition(input);
  return Boolean(resolved && resolved.name !== 'none' && resolved.duration !== 0);
}

function runEnterTransition(nodes: readonly Node[], input: StructuralTransitionInput): void {
  if (!hasTransition(input)) return;
  void runTransitions(collectTransitionElements(nodes), 'enter', input).finished;
}

function startExitTransition(nodes: readonly Node[], input: StructuralTransitionInput): TransitionController {
  return runTransitions(collectTransitionElements(nodes), 'exit', input);
}

function collectTransitionElements(nodes: readonly Node[]): Element[] {
  const elements: Element[] = [];
  for (const node of nodes) {
    if (node instanceof Element) elements.push(node);
    if (node instanceof Element) elements.push(...node.querySelectorAll('[data-vx-transition-child]'));
  }
  return elements;
}

function readStatus(value: unknown): string | undefined {
  const status = readProperty(value, 'status');
  return typeof status === 'string' ? status : undefined;
}

function readBoolean(value: unknown, property: string): boolean {
  return readProperty(value, property) === true;
}

function readProperty(value: unknown, property: string): unknown {
  if (typeof value !== 'object' || value === null || !(property in value)) return undefined;
  return (value as Record<string, unknown>)[property];
}
