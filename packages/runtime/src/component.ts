/**
 * Runtime primitives for final VX component contracts. Component instances own
 * only resources they create; parent signals, contexts, projected content, and
 * forwarded bindings remain borrowed and are released deterministically.
 */
import { attachVisualIntent, applyVisualSemantics, setVisualProperty } from './visual.js';
import { effect, isStateNode, state } from './state.js';
import type { Effect, StateNode } from './state.js';
import { onWidgetEvent, setWidgetProperty } from './dom.js';
import type { Cleanup, MountBlock } from './dom.js';

export type ComponentPropValue<T> = T | StateNode<T>;
export type ComponentProps = Readonly<Record<string, unknown>>;
export type OutputHandler = (payload: unknown) => void;
export type OutputHandlers = Readonly<Record<string, OutputHandler | readonly OutputHandler[] | undefined>>;

export type ContentProviderResult = MountBlock;
export type ContentProvider = () => Node | ContentProviderResult | null;
export type ContentProviders = Readonly<Record<string, ContentProvider | readonly ContentProvider[] | undefined>>;

export interface VisualPartDynamicProperty {
  name: string;
  read(): unknown;
}

export interface VisualPartOverride {
  classNames: readonly string[];
  structuralRole?: string;
  semanticRole?: string;
  dynamic?: readonly VisualPartDynamicProperty[];
}

export type VisualPartOverrides = Readonly<Record<string, VisualPartOverride | undefined>>;

export interface ComponentScope {
  readonly parent: ComponentScope | null;
  readonly values: Map<string, unknown>;
  readonly mountCallbacks: Set<() => void>;
  active: boolean;
  mounted: boolean;
}

export interface ComponentContextLease<T> {
  readonly value: StateNode<T>;
  release(): void;
}

export interface ComponentHandle {
  nodes(): Node[];
  firstElement(): HTMLElement | null;
  focus(options?: FocusOptions): void;
}

export type ComponentRef<T = ComponentHandle> = ((value: T | null) => void) | { current: T | null };

export interface ForwardedBindings {
  attributes?: Readonly<Record<string, unknown>>;
  events?: OutputHandlers;
  className?: unknown;
  style?: unknown;
}

export interface ComponentInstance {
  node: Node;
  ctx?: Readonly<Record<string, unknown>>;
  handle?: ComponentHandle;
  mount?(): void;
  dispose(): void;
}

export interface LazyComponent {
  readonly __vxLazyComponent: true;
  load(): Promise<ComponentFactory>;
}

export type ComponentModuleValue = ComponentFactory | { createComponent?: ComponentFactory; default?: ComponentFactory };

export type ComponentFactory = (
  props?: ComponentProps,
  runtime?: unknown,
  outputs?: OutputHandlers,
  content?: ContentProviders,
  parts?: VisualPartOverrides,
  options?: ComponentCreationOptions
) => ComponentInstance;

export interface ComponentCreationOptions {
  parentScope?: ComponentScope | null;
  forwarded?: ForwardedBindings;
  ref?: ComponentRef;
}

export interface DynamicComponentOptions extends ComponentCreationOptions {
  props?: ComponentProps;
  runtime?: unknown;
  outputs?: OutputHandlers;
  content?: ContentProviders;
  parts?: VisualPartOverrides;
  loading?: ContentProvider;
  error?: (error: unknown) => Node | ContentProviderResult | null;
}

/** Normalizes a literal or borrowed reactive parent value into a component prop signal. */
export function componentProp<T>(
  props: ComponentProps,
  name: string,
  fallback?: () => T,
  required = false
): StateNode<T> {
  const supplied = Object.hasOwn(props, name) ? props[name] : undefined;
  if (isStateNode(supplied)) return supplied as StateNode<T>;
  if (supplied === undefined && !fallback && required) {
    throw new Error(`Required VX component prop '${name}' was not supplied.`);
  }
  const value = supplied !== undefined ? supplied as T : fallback?.() as T;
  return state(value);
}

/** Creates a prop-backed model that emits writes when controlled and owns local state otherwise. */
export function componentModel<T>(
  props: ComponentProps,
  name: string,
  fallback: () => T,
  emit: (name: string, payload?: unknown) => void,
  outputName: string
): StateNode<T> {
  const controlled = Object.hasOwn(props, name);
  const supplied = controlled ? props[name] : undefined;
  const source = isStateNode(supplied) ? supplied as StateNode<T> : undefined;
  const local = state(controlled ? supplied as T : fallback());
  return {
    get value() {
      return source ? source.value : local.value;
    },
    set value(next: T) {
      emit(outputName, next);
      if (!controlled) local.value = next;
    },
    update() {
      local.update();
    },
    dispose() {
      local.dispose();
    },
    dependents: local.dependents
  };
}

/** Creates a tree scope for provider/inject contracts. */
export function createComponentScope(parent: ComponentScope | null = null): ComponentScope {
  return { parent, values: new Map(), mountCallbacks: new Set(), active: true, mounted: false };
}

/** Registers child work that may run only after the owning component enters the live DOM. */
export function onComponentScopeMount(scope: ComponentScope, callback: () => void): Cleanup {
  if (!scope.active) return () => {};
  if (scope.mounted) {
    callback();
    return () => {};
  }
  scope.mountCallbacks.add(callback);
  return () => scope.mountCallbacks.delete(callback);
}

/** Activates a component scope once and flushes queued child mounts in declaration order. */
export function mountComponentScope(scope: ComponentScope): void {
  if (!scope.active || scope.mounted) return;
  scope.mounted = true;
  const callbacks = [...scope.mountCallbacks];
  scope.mountCallbacks.clear();
  for (const callback of callbacks) callback();
}

/** Publishes one borrowed value to descendants of a component. */
export function provideComponentContext(scope: ComponentScope, name: string, value: unknown): void {
  assertContextName(name);
  if (!scope.active) throw new Error('Cannot provide context from a disposed VX component scope.');
  if (scope.values.has(name)) throw new Error(`VX context '${name}' is already provided by this component.`);
  scope.values.set(name, value);
}

/** Acquires a context value without taking ownership of an ancestor signal. */
export function acquireComponentContext<T>(
  scope: ComponentScope | null,
  name: string,
  fallback?: () => T,
  required = false
): ComponentContextLease<T> {
  assertContextName(name);
  let current = scope;
  while (current) {
    if (current.values.has(name)) {
      const supplied = current.values.get(name);
      const value = isStateNode(supplied) ? supplied as StateNode<T> : state(supplied as T);
      const owns = !isStateNode(supplied);
      return { value, release: owns ? () => value.dispose() : () => {} };
    }
    current = current.parent;
  }
  if (!fallback && required) throw new Error(`Required VX context '${name}' was not provided by an ancestor.`);
  const value = state(fallback?.() as T);
  return { value, release: () => value.dispose() };
}

/** Disposes a component scope without touching borrowed ancestor values. */
export function disposeComponentScope(scope: ComponentScope): void {
  if (!scope.active) return;
  scope.active = false;
  scope.mounted = false;
  scope.mountCallbacks.clear();
  scope.values.clear();
}

/** Creates a closed output dispatcher. Undeclared output names fail at runtime as defense in depth. */
export function createOutputDispatcher(
  handlers: OutputHandlers,
  declaredNames: readonly string[]
): (name: string, payload?: unknown) => void {
  const declared = new Set(declaredNames);
  return (name, payload) => {
    if (!declared.has(name)) throw new Error(`VX component attempted to emit undeclared output '${name}'.`);
    const registered = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!registered) return;
    const list = Array.isArray(registered) ? registered : [registered];
    for (const handler of list) {
      if (typeof handler !== 'function') throw new TypeError(`VX output handler '${name}' must be a function.`);
      handler(payload);
    }
  };
}

/** Mounts one declared content region without creating a wrapper element. */
export function mountContentRegion(
  parent: Node,
  providers: ContentProviders,
  name: string,
  cleanupTarget: Cleanup[]
): void {
  const registered = Object.hasOwn(providers, name) ? providers[name] : undefined;
  if (!registered) return;
  const list = Array.isArray(registered) ? registered : [registered];

  for (const provider of list) {
    if (typeof provider !== 'function') throw new TypeError(`VX content provider '${name}' must be a function.`);
    const result = provider();
    appendMountValue(parent, result, cleanupTarget, name);
  }
}

/** Applies a parent-owned visual role to an explicitly public child part. */
export function applyVisualPart(
  node: HTMLElement,
  partName: string,
  overrides: VisualPartOverrides
): Cleanup {
  const override = Object.hasOwn(overrides, partName) ? overrides[partName] : undefined;
  if (!override) return () => {};

  attachVisualIntent(
    node,
    override.classNames,
    override.structuralRole ?? null,
    override.semanticRole ?? null
  );
  if (override.semanticRole) applyVisualSemantics(node, node.dataset['vxWidget'] ?? 'View', override.semanticRole);

  const subscriptions = (override.dynamic ?? []).map((property) =>
    effect(() => setVisualProperty(node, property.name, property.read()))
  );
  return () => {
    for (const subscription of subscriptions) subscription.dispose();
  };
}

/** Applies only capabilities explicitly declared by the child contract. */
export function applyForwardedBindings(node: HTMLElement, forwarded: ForwardedBindings): Cleanup {
  const cleanups: Cleanup[] = [];
  for (const [name, raw] of Object.entries(forwarded.attributes ?? {})) {
    assertSafeForwardAttribute(name);
    const read = isStateNode(raw) ? () => raw.value : () => raw;
    const subscription = effect(() => setWidgetProperty(node, node.dataset['vxWidget'] ?? 'View', name, read()));
    cleanups.push(() => subscription.dispose());
  }
  for (const [name, handler] of Object.entries(forwarded.events ?? {})) {
    assertSafeForwardName(name, 'event');
    const handlers = Array.isArray(handler) ? handler : handler ? [handler] : [];
    for (const item of handlers) {
      if (typeof item !== 'function') throw new TypeError(`Forwarded event '${name}' must be a function.`);
      cleanups.push(onWidgetEvent(node, node.dataset['vxWidget'] ?? 'View', name, (value, nativeEvent) => item(value ?? nativeEvent)));
    }
  }
  if (forwarded.className !== undefined) {
    let applied: string[] = [];
    const subscription = effect(() => {
      for (const className of applied) node.classList.remove(className);
      const value = readForwardValue(forwarded.className);
      applied = value === undefined || value === null || value === false
        ? []
        : String(value).split(/\s+/).filter(Boolean);
      if (applied.length) node.classList.add(...applied);
    });
    cleanups.push(() => {
      subscription.dispose();
      for (const className of applied) node.classList.remove(className);
    });
  }
  if (forwarded.style !== undefined) {
    let applied = new Set<string>();
    const subscription = effect(() => {
      const value = readForwardValue(forwarded.style);
      if (value == null || value === false) {
        for (const name of applied) node.style.removeProperty(toCssProperty(name));
        applied = new Set();
        return;
      }
      if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Forwarded style must be an object.');
      const next = new Set<string>();
      for (const [name, styleValue] of Object.entries(value as Record<string, unknown>)) {
        assertSafeForwardStyle(name);
        next.add(name);
        setVisualProperty(node, name, styleValue);
      }
      for (const name of applied) if (!next.has(name)) node.style.removeProperty(toCssProperty(name));
      applied = next;
    });
    cleanups.push(() => {
      subscription.dispose();
      for (const name of applied) node.style.removeProperty(toCssProperty(name));
    });
  }
  return () => runCleanups(cleanups);
}

/** Assigns a component or primitive ref and clears it on disposal. */
export function assignComponentRef<T>(ref: ComponentRef<T> | undefined, value: T): Cleanup {
  if (!ref) return () => {};
  if (typeof ref === 'function') {
    ref(value);
    return () => ref(null);
  }
  ref.current = value;
  return () => { ref.current = null; };
}

/** Creates a stable public handle for a wrapper-free component range. */
export function createComponentHandle(start: Comment, end: Comment): ComponentHandle {
  const nodes = (): Node[] => {
    const result: Node[] = [];
    let current = start.nextSibling;
    while (current && current !== end) {
      result.push(current);
      current = current.nextSibling;
    }
    return result;
  };
  return Object.freeze({
    nodes,
    firstElement() {
      for (const node of nodes()) {
        if (node instanceof HTMLElement) return node;
        const nested = node instanceof Element ? node.querySelector<HTMLElement>('*') : null;
        if (nested) return nested;
      }
      return null;
    },
    focus(options?: FocusOptions) {
      this.firstElement()?.focus(options);
    }
  });
}

/** Defines one cached async component boundary without confusing a loader with a component factory. */
export function lazyComponent(loader: () => Promise<ComponentModuleValue>): LazyComponent {
  let pending: Promise<ComponentFactory> | undefined;
  return Object.freeze({
    __vxLazyComponent: true as const,
    load() {
      pending ??= Promise.resolve(loader()).then(normalizeComponentFactory);
      return pending;
    }
  });
}

/** Mounts a component factory or Promise of a factory and cancels obsolete resolutions. */
export function dynamicComponentMount(
  parent: Node,
  resolve: () => ComponentFactory | LazyComponent | ComponentModuleValue | Promise<ComponentModuleValue> | null | undefined,
  options: DynamicComponentOptions,
  cleanupTarget: Cleanup[]
): void {
  const start = document.createComment('vx:dynamic:start');
  const end = document.createComment('vx:dynamic:end');
  parent.appendChild(start);
  parent.appendChild(end);
  let instance: ComponentInstance | null = null;
  let fallbackCleanup: Cleanup | undefined;
  let generation = 0;
  let activeFactory: ComponentFactory | null = null;
  let releaseMount: Cleanup | undefined;

  const clear = (): void => {
    releaseMount?.();
    releaseMount = undefined;
    instance?.dispose();
    instance = null;
    fallbackCleanup?.();
    fallbackCleanup = undefined;
    removeBetween(start, end);
  };

  const mountFallback = (provider: ContentProvider | undefined, error?: unknown): void => {
    if (!provider && error === undefined) return;
    const fragment = document.createDocumentFragment();
    const cleanups: Cleanup[] = [];
    const result = error === undefined ? provider?.() : options.error?.(error);
    appendMountValue(fragment, result ?? null, cleanups, error === undefined ? 'loading' : 'error');
    end.parentNode?.insertBefore(fragment, end);
    fallbackCleanup = () => runCleanups(cleanups);
  };

  function mountFactory(factory: ComponentFactory): void {
    if (activeFactory === factory && instance) return;
    clear();
    activeFactory = factory;
    try {
      instance = factory(options.props, options.runtime, options.outputs, options.content, options.parts, options);
      end.parentNode?.insertBefore(instance.node, end);
      const activate = (): void => {
        try {
          instance?.mount?.();
        } catch (error) {
          clear();
          activeFactory = null;
          mountFallback(undefined, error);
        }
      };
      releaseMount = options.parentScope
        ? onComponentScopeMount(options.parentScope, activate)
        : (() => { activate(); return () => {}; })();
    } catch (error) {
      clear();
      activeFactory = null;
      mountFallback(undefined, error);
    }
  }

  const subscription = effect(() => {
    const selected = resolve();
    const currentGeneration = ++generation;
    if (!selected) {
      activeFactory = null;
      clear();
      return;
    }
    const pending = isLazyComponent(selected)
      ? selected.load()
      : typeof (selected as Promise<ComponentModuleValue>).then === 'function'
        ? Promise.resolve(selected).then(normalizeComponentFactory)
        : undefined;
    if (pending) {
      clear();
      mountFallback(options.loading);
      void pending.then((factory) => {
        if (currentGeneration !== generation) return;
        mountFactory(factory);
      }, (error: unknown) => {
        if (currentGeneration !== generation) return;
        clear();
        mountFallback(undefined, error);
      });
      return;
    }
    mountFactory(normalizeComponentFactory(selected as ComponentModuleValue));
  });

  cleanupTarget.push(() => {
    generation += 1;
    subscription.dispose();
    clear();
    removeComponentRange(start, end);
  });
}

/** Mounts content into a reactive external DOM target while preserving node identity across moves. */
export function portalMount(
  resolveTarget: () => Node | null | undefined,
  provider: ContentProvider,
  cleanupTarget: Cleanup[]
): void {
  const start = document.createComment('vx:portal:start');
  const end = document.createComment('vx:portal:end');
  const fragment = document.createDocumentFragment();
  const providerCleanups: Cleanup[] = [];
  fragment.appendChild(start);
  appendMountValue(fragment, provider(), providerCleanups, 'portal');
  fragment.appendChild(end);
  let mounted = false;
  const subscription: Effect = effect(() => {
    const target = resolveTarget();
    if (!target) return;
    if (!mounted) {
      target.appendChild(fragment);
      mounted = true;
      return;
    }
    if (start.parentNode === target && end.parentNode === target) return;
    const range = document.createDocumentFragment();
    let current: Node | null = start;
    while (current) {
      const next: Node | null = current.nextSibling;
      range.appendChild(current);
      if (current === end) break;
      current = next;
    }
    target.appendChild(range);
  });
  cleanupTarget.push(() => {
    subscription.dispose();
    runCleanups(providerCleanups);
    removeComponentRange(start, end);
  });
}

/** Removes all nodes inside an inclusive component boundary. */
export function removeComponentRange(start: Comment, end: Comment): void {
  const parent = start.parentNode;
  if (!parent || end.parentNode !== parent) return;
  let current: Node | null = start;
  while (current) {
    const next: Node | null = current.nextSibling;
    parent.removeChild(current);
    if (current === end) break;
    current = next;
  }
}

function normalizeComponentFactory(value: ComponentModuleValue): ComponentFactory {
  if (typeof value === 'function') return value;
  const factory = value.createComponent ?? value.default;
  if (typeof factory !== 'function') throw new TypeError('Dynamic VX component resolution did not produce a createComponent factory.');
  return factory;
}

function isLazyComponent(value: unknown): value is LazyComponent {
  return typeof value === 'object' && value !== null && (value as { __vxLazyComponent?: unknown }).__vxLazyComponent === true;
}

function appendMountValue(parent: Node, result: Node | ContentProviderResult | null, cleanups: Cleanup[], name: string): void {
  if (!result) return;
  if (isMountBlock(result)) {
    parent.appendChild(result.node);
    if (result.cleanup) cleanups.push(result.cleanup);
  } else if (result instanceof Node) {
    parent.appendChild(result);
  } else {
    throw new TypeError(`VX content provider '${name}' returned an invalid mount value.`);
  }
}

function removeBetween(start: Comment, end: Comment): void {
  let current = start.nextSibling;
  while (current && current !== end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

function runCleanups(cleanups: readonly Cleanup[]): void {
  const errors: unknown[] = [];
  for (const cleanup of [...cleanups].reverse()) {
    try { cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Failed to dispose VX component resources.');
}

function readForwardValue(value: unknown): unknown {
  return isStateNode(value) ? value.value : value;
}

function toCssProperty(name: string): string {
  return name.startsWith('--') ? name : name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function assertContextName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name) || UNSAFE_FORWARD_NAMES.has(name)) {
    throw new Error(`Invalid VX context name '${name}'.`);
  }
}

function assertSafeForwardName(name: string, kind: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name) || UNSAFE_FORWARD_NAMES.has(name)) {
    throw new Error(`Unsafe forwarded ${kind} '${name}'.`);
  }
}

function assertSafeForwardAttribute(name: string): void {
  assertSafeForwardName(name, 'attribute');
  const normalized = name.toLowerCase();
  if (UNSAFE_FORWARD_ATTRIBUTES.has(normalized) || /^on[a-z]/.test(normalized)) {
    throw new Error(`Unsafe forwarded attribute '${name}'.`);
  }
}

function assertSafeForwardStyle(name: string): void {
  assertSafeForwardName(name, 'style');
  const normalized = toCssProperty(name).toLowerCase();
  if (UNSAFE_FORWARD_STYLES.has(normalized)) throw new Error(`Unsafe forwarded style '${name}'.`);
}

function isMountBlock(value: unknown): value is ContentProviderResult {
  return typeof value === 'object' && value !== null && 'node' in value && (value as { node?: unknown }).node instanceof Node;
}

const UNSAFE_FORWARD_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const UNSAFE_FORWARD_ATTRIBUTES = new Set(['innerhtml', 'outerhtml', 'srcdoc']);
const UNSAFE_FORWARD_STYLES = new Set(['behavior', '-moz-binding']);
