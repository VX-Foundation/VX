/** Cooperative priority scheduler used by the VX reactive and rendering runtimes. */

export type SchedulerPriority = 'immediate' | 'user-blocking' | 'normal' | 'transition' | 'idle';
export type SchedulerTaskState = 'scheduled' | 'running' | 'completed' | 'cancelled';

export interface SchedulerTaskContext {
  readonly signal: AbortSignal;
  readonly priority: SchedulerPriority;
  shouldYield(): boolean;
}

export type SchedulerCallback = (context: SchedulerTaskContext) => void | SchedulerCallback;

export interface ScheduleTaskOptions {
  priority?: SchedulerPriority;
  signal?: AbortSignal;
  label?: string;
  onError?: (error: unknown) => void;
}

export interface ScheduledTask {
  readonly id: number;
  readonly label: string | undefined;
  readonly priority: SchedulerPriority;
  readonly signal: AbortSignal;
  readonly state: SchedulerTaskState;
  readonly finished: Promise<void>;
  cancel(reason?: unknown): void;
}

export interface SchedulerDiagnosticSnapshot {
  readonly pending: Readonly<Record<SchedulerPriority, number>>;
  readonly flushing: boolean;
  readonly currentPriority: SchedulerPriority;
  readonly completed: number;
  readonly cancelled: number;
  readonly errors: number;
}

interface InternalTask {
  id: number;
  label?: string;
  priority: SchedulerPriority;
  callback: SchedulerCallback;
  controller: AbortController;
  externalSignal?: AbortSignal;
  externalAbort?: () => void;
  onError?: (error: unknown) => void;
  state: SchedulerTaskState;
  resolve(): void;
  publicTask: ScheduledTask;
}

const PRIORITIES: readonly SchedulerPriority[] = ['immediate', 'user-blocking', 'normal', 'transition', 'idle'];
const PRIORITY_INDEX = new Map(PRIORITIES.map((priority, index) => [priority, index]));
const queues = new Map<SchedulerPriority, InternalTask[]>(PRIORITIES.map((priority) => [priority, []]));
const pendingCounts = new Map<SchedulerPriority, number>(PRIORITIES.map((priority) => [priority, 0]));
const errorHandlers = new Set<(error: unknown, task: ScheduledTask) => void>();

let nextTaskId = 1;
let hostFlushScheduled = false;
let hostFlushKind: 'microtask' | 'animation' | 'idle' | undefined;
let flushing = false;
let currentPriority: SchedulerPriority = 'normal';
let completedTasks = 0;
let cancelledTasks = 0;
let schedulerErrors = 0;
const SLICE_MS = 8;
const MAX_TASKS_PER_FLUSH = 100_000;

export function scheduleTask(callback: SchedulerCallback, options: ScheduleTaskOptions = {}): ScheduledTask {
  if (typeof callback !== 'function') throw new TypeError('VX scheduler tasks require a callback.');
  const priority = options.priority ?? currentPriority;
  assertPriority(priority);
  const controller = new AbortController();
  let resolveFinished = (): void => undefined;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const task = {} as InternalTask;
  const publicTask: ScheduledTask = {
    get id() { return task.id; },
    get label() { return task.label; },
    get priority() { return task.priority; },
    get signal() { return task.controller.signal; },
    get state() { return task.state; },
    finished,
    cancel(reason) { cancelTask(task, reason); }
  };
  Object.assign(task, {
    id: nextTaskId++,
    ...(options.label ? { label: options.label } : {}),
    priority,
    callback,
    controller,
    ...(options.signal ? { externalSignal: options.signal } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
    state: 'scheduled' as const,
    resolve: resolveFinished,
    publicTask
  });

  if (options.signal?.aborted) {
    task.state = 'cancelled';
    cancelTask(task, options.signal.reason);
    return publicTask;
  }
  if (options.signal) {
    const abort = (): void => cancelTask(task, options.signal?.reason);
    task.externalAbort = abort;
    options.signal.addEventListener('abort', abort, { once: true });
  }
  queues.get(priority)!.push(task);
  pendingCounts.set(priority, pendingCounts.get(priority)! + 1);
  requestHostFlush();
  return publicTask;
}

export function cancelScheduledTask(task: ScheduledTask, reason?: unknown): void {
  task.cancel(reason);
}

export function runWithPriority<T>(priority: SchedulerPriority, operation: () => T): T {
  assertPriority(priority);
  const previous = currentPriority;
  currentPriority = priority;
  try {
    return operation();
  } finally {
    currentPriority = previous;
  }
}

export function startTransition<T>(operation: () => T): T {
  return runWithPriority('transition', operation);
}

export function getCurrentPriority(): SchedulerPriority {
  return currentPriority;
}

export function flushSync<T>(operation?: () => T): T | undefined {
  const result = operation ? runWithPriority('immediate', operation) : undefined;
  drainQueues(false, false);
  return result;
}

export function flushScheduler(options: { includeIdle?: boolean } = {}): void {
  drainQueues(options.includeIdle ?? true, false);
}

export function nextTick(priority: SchedulerPriority = 'normal'): Promise<void> {
  return new Promise((resolve) => {
    scheduleTask(() => resolve(), { priority, label: 'vx.nextTick' });
  });
}

export function onSchedulerError(handler: (error: unknown, task: ScheduledTask) => void): () => void {
  errorHandlers.add(handler);
  return () => errorHandlers.delete(handler);
}

export function getSchedulerDiagnostics(): SchedulerDiagnosticSnapshot {
  return Object.freeze({
    pending: Object.freeze(Object.fromEntries(PRIORITIES.map((priority) => [priority, pendingCount(priority)])) as Record<SchedulerPriority, number>),
    flushing,
    currentPriority,
    completed: completedTasks,
    cancelled: cancelledTasks,
    errors: schedulerErrors
  });
}

export function compareSchedulerPriority(left: SchedulerPriority, right: SchedulerPriority): number {
  return PRIORITY_INDEX.get(left)! - PRIORITY_INDEX.get(right)!;
}

function requestHostFlush(): void {
  if (flushing) return;
  const priority = highestPendingPriority();
  if (hostFlushScheduled) {
    if (shouldPreemptHostFlush(priority, hostFlushKind)) {
      hostFlushKind = priority === 'transition' ? 'animation' : 'microtask';
      if (hostFlushKind === 'animation' && typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => hostFlush(false));
      } else {
        hostFlushKind = 'microtask';
        queueMicrotask(() => hostFlush(false));
      }
    }
    return;
  }
  hostFlushScheduled = true;
  if (priority === 'idle') {
    hostFlushKind = 'idle';
    const target = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    if (typeof target.requestIdleCallback === 'function') {
      target.requestIdleCallback(() => hostFlush(true), { timeout: 100 });
    } else {
      setTimeout(() => hostFlush(true), 16);
    }
    return;
  }
  if (priority === 'transition' && typeof globalThis.requestAnimationFrame === 'function') {
    hostFlushKind = 'animation';
    globalThis.requestAnimationFrame(() => hostFlush(false));
    return;
  }
  hostFlushKind = 'microtask';
  queueMicrotask(() => hostFlush(false));
}

function hostFlush(includeIdle: boolean): void {
  hostFlushScheduled = false;
  hostFlushKind = undefined;
  drainQueues(includeIdle, true);
  if (hasPendingTasks()) requestHostFlush();
}

function drainQueues(includeIdle: boolean, cooperative: boolean): void {
  if (flushing) return;
  flushing = true;
  const started = now();
  let executed = 0;
  try {
    outer: for (const priority of PRIORITIES) {
      if (priority === 'idle' && !includeIdle) continue;
      const queue = queues.get(priority)!;
      while (queue.length > 0) {
        const task = queue.shift()!;
        if (task.state !== 'scheduled') continue;
        executeTask(task, started);
        executed += 1;
        if (executed > MAX_TASKS_PER_FLUSH) {
          reportTaskError(new Error('VX scheduler exceeded the maximum number of tasks in one flush.'), task);
          break outer;
        }
        if (cooperative && priority !== 'immediate' && now() - started >= SLICE_MS) break outer;
      }
    }
  } finally {
    flushing = false;
  }
}

function executeTask(task: InternalTask, started: number): void {
  if (task.controller.signal.aborted) {
    finishCancelled(task);
    return;
  }
  task.state = 'running';
  pendingCounts.set(task.priority, Math.max(0, pendingCounts.get(task.priority)! - 1));
  const previous = currentPriority;
  currentPriority = task.priority;
  try {
    const continuation = task.callback({
      signal: task.controller.signal,
      priority: task.priority,
      shouldYield: () => task.priority !== 'immediate' && now() - started >= SLICE_MS
    });
    if (typeof continuation === 'function' && !task.controller.signal.aborted) {
      task.callback = continuation;
      task.state = 'scheduled';
      queues.get(task.priority)!.push(task);
      pendingCounts.set(task.priority, pendingCounts.get(task.priority)! + 1);
      return;
    }
    task.state = 'completed';
    completedTasks += 1;
    finishTask(task);
  } catch (error) {
    task.state = 'completed';
    schedulerErrors += 1;
    reportTaskError(error, task);
    finishTask(task);
  } finally {
    currentPriority = previous;
  }
}

function cancelTask(task: InternalTask, reason?: unknown): void {
  if (task.state === 'completed' || task.state === 'cancelled') return;
  if (task.state === 'scheduled') {
    pendingCounts.set(task.priority, Math.max(0, pendingCounts.get(task.priority)! - 1));
  }
  task.state = 'cancelled';
  cancelledTasks += 1;
  if (!task.controller.signal.aborted) {
    task.controller.abort(reason ?? new DOMException('VX scheduler task cancelled.', 'AbortError'));
  }
  finishTask(task);
}

function finishCancelled(task: InternalTask): void {
  if (task.state === 'scheduled') {
    pendingCounts.set(task.priority, Math.max(0, pendingCounts.get(task.priority)! - 1));
  }
  if (task.state !== 'cancelled') {
    task.state = 'cancelled';
    cancelledTasks += 1;
  }
  finishTask(task);
}

function finishTask(task: InternalTask): void {
  if (task.externalSignal && task.externalAbort) task.externalSignal.removeEventListener('abort', task.externalAbort);
  task.resolve();
}

function reportTaskError(error: unknown, task: InternalTask): void {
  if (task.onError) {
    try { task.onError(error); } catch (handlerError) { queueMicrotask(() => { throw handlerError; }); }
    return;
  }
  if (errorHandlers.size > 0) {
    for (const handler of errorHandlers) {
      try { handler(error, task.publicTask); } catch (handlerError) { queueMicrotask(() => { throw handlerError; }); }
    }
    return;
  }
  queueMicrotask(() => { throw error; });
}


function shouldPreemptHostFlush(priority: SchedulerPriority, kind: typeof hostFlushKind): boolean {
  if (!kind || kind === 'microtask') return false;
  if (priority === 'immediate' || priority === 'user-blocking' || priority === 'normal') return true;
  return priority === 'transition' && kind === 'idle';
}

function highestPendingPriority(): SchedulerPriority {
  for (const priority of PRIORITIES) if (pendingCount(priority) > 0) return priority;
  return 'idle';
}

function pendingCount(priority: SchedulerPriority): number {
  return pendingCounts.get(priority)!;
}

function hasPendingTasks(): boolean {
  return PRIORITIES.some((priority) => pendingCount(priority) > 0);
}

function assertPriority(priority: string): asserts priority is SchedulerPriority {
  if (!PRIORITY_INDEX.has(priority as SchedulerPriority)) throw new TypeError(`Unknown VX scheduler priority '${priority}'.`);
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

