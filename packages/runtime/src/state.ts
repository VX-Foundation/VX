/** VX fine-grained reactive runtime backed by the priority scheduler. */

import {
  compareSchedulerPriority,
  getCurrentPriority,
  scheduleTask,
  type ScheduledTask,
  type SchedulerPriority
} from './scheduler.js';
import { emitDevtoolsEvent } from './devtools.js';

interface ReactiveDependency {
  dependents: Set<ReactiveSubscriber>;
}

type SubscriberKind = 'derived' | 'effect';

interface ReactiveSubscriber {
  dependencies: Set<ReactiveDependency>;
  active: boolean;
  kind: SubscriberKind;
  priority: SchedulerPriority;
  pendingPriority: SchedulerPriority | undefined;
  pendingTask: ScheduledTask | undefined;
  update(): void;
  runQueued(): void;
  dispose(): void;
}

const reactiveNodes = new WeakSet<object>();
const pendingSubscribers = new Set<ReactiveSubscriber>();
const reactiveErrorHandlers = new Set<(error: unknown, label?: string) => void>();

let currentListener: ReactiveSubscriber | null = null;
let batchDepth = 0;
let reactiveDebugId = 0;

export interface StateNode<T> extends ReactiveDependency {
  get value(): T;
  set value(value: T);
  update(): void;
  dispose(): void;
}

export interface EffectOptions {
  priority?: SchedulerPriority;
  label?: string;
  onError?: (error: unknown) => void;
}

export interface Effect {
  update(): void;
  dispose(): void;
  readonly active: boolean;
  readonly priority: SchedulerPriority;
}

export function batch<T>(fn: () => T): T {
  batchDepth += 1;
  try {
    return fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) schedulePendingSubscribers();
  }
}

export function state<T>(initialValue: T): StateNode<T> {
  const debugId = `state:${++reactiveDebugId}`;
  let value = initialValue;
  emitDevtoolsEvent('state', 'register', debugId, { id: debugId, category: 'state', name: debugId, value: initialValue, createdAt: Date.now(), updatedAt: Date.now() });
  let active = true;
  const dependents = new Set<ReactiveSubscriber>();

  const node: StateNode<T> = {
    get value() {
      trackDependency(node);
      return value;
    },
    set value(nextValue: T) {
      if (!active || Object.is(value, nextValue)) return;
      value = nextValue;
      emitDevtoolsEvent('state', 'update', debugId, { id: debugId, category: 'state', name: debugId, value: nextValue, updatedAt: Date.now(), createdAt: Date.now() });
      notify(dependents);
    },
    update() {},
    dispose() {
      if (!active) return;
      active = false;
      dependents.clear();
      emitDevtoolsEvent('state', 'remove', debugId);
    },
    dependents
  };
  reactiveNodes.add(node);
  return node;
}

export function derive<T>(compute: () => T): StateNode<T> {
  const debugId = `derive:${++reactiveDebugId}`;
  emitDevtoolsEvent('derive', 'register', debugId, { id: debugId, category: 'derive', name: debugId, createdAt: Date.now(), updatedAt: Date.now() });
  if (typeof compute !== 'function') throw new TypeError('VX derived state requires a compute function.');
  let value!: T;
  let initialized = false;
  let dirty = true;
  let evaluating = false;
  const dependents = new Set<ReactiveSubscriber>();

  const subscriber: ReactiveSubscriber = {
    dependencies: new Set(),
    active: true,
    kind: 'derived',
    priority: 'immediate',
    pendingPriority: undefined,
    pendingTask: undefined,
    update() {
      if (!subscriber.active || dirty) return;
      dirty = true;
      notify(dependents);
    },
    runQueued() { subscriber.update(); },
    dispose() {
      if (!subscriber.active) return;
      subscriber.active = false;
      cancelPending(subscriber);
      cleanupDependencies(subscriber);
      dependents.clear();
      emitDevtoolsEvent('derive', 'remove', debugId);
    }
  };

  const node: StateNode<T> = {
    get value() {
      trackDependency(node);
      if (dirty || !initialized) {
        if (evaluating) throw new Error('VX detected a circular derived-state dependency.');
        cleanupDependencies(subscriber);
        const previous = currentListener;
        currentListener = subscriber;
        evaluating = true;
        try {
          value = compute();
          emitDevtoolsEvent('derive', 'update', debugId, { id: debugId, category: 'derive', name: debugId, value, createdAt: Date.now(), updatedAt: Date.now() });
          initialized = true;
          dirty = false;
        } finally {
          evaluating = false;
          currentListener = previous;
        }
      }
      return value;
    },
    set value(_nextValue: T) {
      throw new Error('Cannot assign to a derived value.');
    },
    update: subscriber.update,
    dispose: subscriber.dispose,
    dependents
  };

  reactiveNodes.add(node);
  return node;
}

export function isStateNode(value: unknown): value is StateNode<unknown> {
  return typeof value === 'object' && value !== null && reactiveNodes.has(value);
}

export function effect(run: () => void | (() => void), options: EffectOptions = {}): Effect {
  const debugId = `effect:${++reactiveDebugId}`;
  emitDevtoolsEvent('effect', 'register', debugId, { id: debugId, category: 'effect', name: options.label ?? debugId, status: 'active', createdAt: Date.now(), updatedAt: Date.now() });
  if (typeof run !== 'function') throw new TypeError('VX effects require a callback.');
  let cleanup: (() => void) | undefined;
  const priority = options.priority ?? 'normal';

  const subscriber: ReactiveSubscriber = {
    dependencies: new Set(),
    active: true,
    kind: 'effect',
    priority,
    pendingPriority: undefined,
    pendingTask: undefined,
    update() {
      cancelPending(subscriber);
      execute(false);
    },
    runQueued() {
      subscriber.pendingTask = undefined;
      subscriber.pendingPriority = undefined;
      execute(false);
    },
    dispose() {
      if (!subscriber.active) return;
      subscriber.active = false;
      cancelPending(subscriber);
      cleanupDependencies(subscriber);
      const previousCleanup = cleanup;
      cleanup = undefined;
      previousCleanup?.();
      emitDevtoolsEvent('effect', 'remove', debugId);
    }
  };

  const execute = (initial: boolean): void => {
    if (!subscriber.active) return;
    cleanupDependencies(subscriber);
    const previousCleanup = cleanup;
    cleanup = undefined;
    try {
      previousCleanup?.();
      const previous = currentListener;
      currentListener = subscriber;
      try {
        const result = run();
        emitDevtoolsEvent('effect', 'update', debugId, { id: debugId, category: 'effect', name: options.label ?? debugId, status: 'completed', createdAt: Date.now(), updatedAt: Date.now() });
        if (typeof result === 'function') cleanup = result;
      } finally {
        currentListener = previous;
      }
    } catch (error) {
      handleReactiveError(error, options.label, options.onError, initial);
    }
  };

  execute(true);

  return {
    update: subscriber.update,
    dispose: subscriber.dispose,
    get active() { return subscriber.active; },
    priority
  };
}

export function untrack<T>(operation: () => T): T {
  const previous = currentListener;
  currentListener = null;
  try { return operation(); } finally { currentListener = previous; }
}

export function onReactiveError(handler: (error: unknown, label?: string) => void): () => void {
  reactiveErrorHandlers.add(handler);
  return () => reactiveErrorHandlers.delete(handler);
}

function trackDependency(dependency: ReactiveDependency): void {
  if (!currentListener?.active) return;
  dependency.dependents.add(currentListener);
  currentListener.dependencies.add(dependency);
}

function cleanupDependencies(subscriber: ReactiveSubscriber): void {
  for (const dependency of subscriber.dependencies) dependency.dependents.delete(subscriber);
  subscriber.dependencies.clear();
}

function notify(dependents: ReadonlySet<ReactiveSubscriber>): void {
  const priority = getCurrentPriority();
  for (const dependent of [...dependents]) {
    if (!dependent.active) continue;
    if (dependent.kind === 'derived') {
      dependent.update();
      continue;
    }
    queueSubscriber(dependent, higherPriority(priority, dependent.priority));
  }
  if (batchDepth === 0) schedulePendingSubscribers();
}

function queueSubscriber(subscriber: ReactiveSubscriber, priority: SchedulerPriority): void {
  const pending = subscriber.pendingPriority;
  if (!pending || compareSchedulerPriority(priority, pending) < 0) subscriber.pendingPriority = priority;
  pendingSubscribers.add(subscriber);
}

function schedulePendingSubscribers(): void {
  if (pendingSubscribers.size === 0) return;
  const subscribers = [...pendingSubscribers];
  pendingSubscribers.clear();
  for (const subscriber of subscribers) {
    if (!subscriber.active) continue;
    const priority = subscriber.pendingPriority ?? subscriber.priority;
    if (subscriber.pendingTask && subscriber.pendingTask.state === 'scheduled') {
      if (compareSchedulerPriority(priority, subscriber.pendingTask.priority) >= 0) continue;
      subscriber.pendingTask.cancel(new DOMException('VX reactive effect reprioritized.', 'AbortError'));
    }
    subscriber.pendingTask = scheduleTask(() => subscriber.runQueued(), {
      priority,
      label: 'vx.reactive-effect',
      onError: (error) => handleReactiveError(error, undefined, undefined, false)
    });
  }
}

function cancelPending(subscriber: ReactiveSubscriber): void {
  pendingSubscribers.delete(subscriber);
  subscriber.pendingPriority = undefined;
  subscriber.pendingTask?.cancel(new DOMException('VX reactive subscriber disposed or updated.', 'AbortError'));
  subscriber.pendingTask = undefined;
}

function higherPriority(left: SchedulerPriority, right: SchedulerPriority): SchedulerPriority {
  return compareSchedulerPriority(left, right) < 0 ? left : right;
}

function handleReactiveError(
  error: unknown,
  label: string | undefined,
  local: ((error: unknown) => void) | undefined,
  initial: boolean
): void {
  if (local) {
    local(error);
    return;
  }
  if (reactiveErrorHandlers.size > 0) {
    for (const handler of reactiveErrorHandlers) handler(error, label);
    return;
  }
  if (initial) throw error;
  queueMicrotask(() => { throw error; });
}

/** @deprecated Use effect(). */
export const reaction = effect;
