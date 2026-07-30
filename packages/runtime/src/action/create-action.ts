import { batch, state } from '../state.js';
import { emitDevtoolsEvent } from '../devtools.js';
import { normalizeActionError } from './error.js';
import {
  applyOptimistic,
  commitTransaction,
  rollbackTransaction,
  scheduleInvalidation,
  scheduleRefresh,
  scheduleTagInvalidation,
  type ActionTransaction
} from './execution.js';
import type {
  ActionError,
  ActionExecutionContext,
  ActionHandler,
  ActionOptions,
  ActionProgress,
  ActionSnapshot,
  ManagedAction
} from './types.js';

export function createAction<TArgs extends unknown[], TResult>(
  handler: ActionHandler<TArgs, TResult>,
  options: ActionOptions<TArgs>
): ManagedAction<TArgs, TResult> {
  const debugId = `action:${options.name}`;
  emitDevtoolsEvent('action', 'register', debugId, { id: debugId, category: 'action', name: options.name, status: 'idle', createdAt: Date.now(), updatedAt: Date.now() });
  const snapshot = state<ActionSnapshot<TResult>>(idleSnapshot());
  let current: { controller: AbortController; generation: number } | undefined;
  let generation = 0;

  const action = ((...args: TArgs): TResult | Promise<TResult> => {
    const concurrency = options.concurrent ?? 'cancel-previous';
    if (current && concurrency === 'reject') throw new Error(`Action '${options.name}' is already running.`);
    if (current && concurrency === 'cancel-previous') current.controller.abort(new DOMException('Superseded action', 'AbortError'));

    const controller = new AbortController();
    const executionGeneration = ++generation;
    const idempotencyKey = options.idempotencyKey?.(args) ?? createIdempotencyKey(options.name);
    current = { controller, generation: executionGeneration };
    snapshot.value = {
      status: 'running', running: true, queued: false, data: snapshot.value.data,
      error: undefined, progress: undefined, attempt: 1, idempotencyKey,
      startedAt: Date.now(), finishedAt: undefined
    };
    emitDevtoolsEvent('action', 'update', debugId, { id: debugId, category: 'action', name: options.name, status: 'running', value: snapshot.value, createdAt: Date.now(), updatedAt: Date.now() });

    const execute = async (): Promise<TResult> => {
      const maxRetries = nonNegativeInteger(options.retries, 0);
      let attempt = 0;
      for (;;) {
        attempt += 1;
        const transaction = createTransaction(options);
        const timeout = createTimeout(controller, options.timeoutMs);
        const context = createContext(
          controller,
          executionGeneration,
          () => generation,
          attempt,
          idempotencyKey,
          transaction,
          (progress) => updateProgress(snapshot, executionGeneration, generation, progress)
        );
        snapshot.value = { ...snapshot.value, attempt };
        try {
          const value = await batch(() => handler(context, ...args));
          assertCurrent(controller, executionGeneration, generation);
          commitTransaction(transaction);
          succeed(snapshot, value);
          emitDevtoolsEvent('action', 'update', debugId, { id: debugId, category: 'action', name: options.name, status: 'success', value: snapshot.value, createdAt: Date.now(), updatedAt: Date.now() });
          clearCurrent(executionGeneration);
          return value;
        } catch (caught) {
          timeout();
          if (controller.signal.aborted || executionGeneration !== generation) {
            rollbackTransaction(transaction);
            if (executionGeneration === generation) cancelSnapshot(snapshot);
            clearCurrent(executionGeneration);
            throw controller.signal.reason ?? caught;
          }
          const error = normalizeActionError(caught);
          const shouldQueue = options.queue && options.networkMode === 'offline-first' && isOffline(options.queue, error);
          if (shouldQueue) {
            commitTransaction(transaction);
            snapshot.value = { ...snapshot.value, status: 'queued', running: false, queued: true, error: undefined, finishedAt: Date.now() };
            try {
              const queued = await options.queue!.enqueue<TResult>({
                action: options.name,
                args,
                idempotencyKey,
                createdAt: Date.now(),
                execute: async (signal) => {
                  const linked = linkSignals(controller.signal, signal);
                  const queuedTransaction = createTransaction(options);
                  try {
                    const queuedContext = createContext(
                      linked,
                      executionGeneration,
                      () => generation,
                      attempt + 1,
                      idempotencyKey,
                      queuedTransaction,
                      (progress) => updateProgress(snapshot, executionGeneration, generation, progress)
                    );
                    const value = await handler(queuedContext, ...args);
                    commitTransaction(queuedTransaction);
                    return value;
                  } catch (error) {
                    rollbackTransaction(queuedTransaction);
                    throw error;
                  } finally {
                    linked.abort();
                  }
                }
              });
              succeed(snapshot, queued);
              clearCurrent(executionGeneration);
              return queued;
            } catch (queueError) {
              fail(snapshot, queueError);
              clearCurrent(executionGeneration);
              throw queueError;
            }
          }
          rollbackTransaction(transaction);
          const retryable = options.retryable?.(error, attempt) ?? defaultRetryable(error);
          if (attempt <= maxRetries && retryable) {
            await wait(retryDelay(attempt, options), controller.signal);
            continue;
          }
          fail(snapshot, caught);
          emitDevtoolsEvent('action', 'error', debugId, { id: debugId, category: 'action', name: options.name, status: 'error', value: snapshot.value, createdAt: Date.now(), updatedAt: Date.now() });
          clearCurrent(executionGeneration);
          throw caught;
        } finally {
          timeout();
        }
      }
    };

    const result = execute();
    return result;
  }) as ManagedAction<TArgs, TResult>;

  Object.defineProperties(action, {
    status: { get: () => snapshot.value.status },
    running: { get: () => snapshot.value.running },
    queued: { get: () => snapshot.value.queued },
    data: { get: () => snapshot.value.data },
    error: { get: () => snapshot.value.error },
    progress: { get: () => snapshot.value.progress },
    attempt: { get: () => snapshot.value.attempt },
    idempotencyKey: { get: () => snapshot.value.idempotencyKey }
  });
  action.cancel = (reason?: unknown): void => {
    if (!current) return;
    current.controller.abort(reason ?? new DOMException('Action cancelled', 'AbortError'));
    current = undefined;
    cancelSnapshot(snapshot);
  };
  action.reset = (): void => {
    if (snapshot.value.running) throw new Error(`Cannot reset running action '${options.name}'.`);
    snapshot.value = idleSnapshot();
  };
  return action;

  function clearCurrent(expectedGeneration: number): void {
    if (current?.generation === expectedGeneration) current = undefined;
  }
}

function createContext(
  controller: AbortController,
  executionGeneration: number,
  currentGeneration: () => number,
  attempt: number,
  idempotencyKey: string,
  transaction: ActionTransaction,
  report: (progress: ActionProgress) => void
): ActionExecutionContext {
  return {
    signal: controller.signal,
    attempt,
    idempotencyKey,
    commit(operation) {
      if (controller.signal.aborted || executionGeneration !== currentGeneration()) return false;
      batch(operation);
      return true;
    },
    optimistic(resource, updater) {
      assertCurrent(controller, executionGeneration, currentGeneration());
      applyOptimistic(transaction, resource, updater);
    },
    invalidate(target) {
      assertCurrent(controller, executionGeneration, currentGeneration());
      scheduleInvalidation(transaction, target);
    },
    invalidateTags(tags) {
      assertCurrent(controller, executionGeneration, currentGeneration());
      scheduleTagInvalidation(transaction, tags);
    },
    refresh(resource) {
      assertCurrent(controller, executionGeneration, currentGeneration());
      scheduleRefresh(transaction, resource);
    },
    reportProgress(progress) {
      assertCurrent(controller, executionGeneration, currentGeneration());
      report(normalizeProgress(progress));
    }
  };
}

function createTransaction<TArgs extends unknown[]>(options: ActionOptions<TArgs>): ActionTransaction {
  return {
    rollbacks: [],
    invalidations: [],
    tagInvalidations: [],
    refreshes: [],
    ...(options.queryClient ? { queryClient: options.queryClient } : {})
  };
}

function createTimeout(controller: AbortController, timeoutMs: number | undefined): () => void {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return () => undefined;
  const timer = setTimeout(() => controller.abort(new DOMException('Action timed out', 'TimeoutError')), timeoutMs);
  return () => clearTimeout(timer);
}

function assertCurrent(controller: AbortController, executionGeneration: number, currentGeneration: number): void {
  if (!controller.signal.aborted && executionGeneration === currentGeneration) return;
  throw controller.signal.reason ?? new DOMException('Action execution is no longer current.', 'AbortError');
}

function idleSnapshot<T>(): ActionSnapshot<T> {
  return {
    status: 'idle', running: false, queued: false, data: undefined, error: undefined,
    progress: undefined, attempt: 0, idempotencyKey: undefined,
    startedAt: undefined, finishedAt: undefined
  };
}

function succeed<T>(node: ReturnType<typeof state<ActionSnapshot<T>>>, data: T): void {
  node.value = {
    ...node.value, status: 'success', running: false, queued: false,
    data, error: undefined, progress: node.value.progress, finishedAt: Date.now()
  };
}

function fail<T>(node: ReturnType<typeof state<ActionSnapshot<T>>>, error: unknown): void {
  node.value = {
    ...node.value, status: 'error', running: false, queued: false,
    error: normalizeActionError(error), finishedAt: Date.now()
  };
}

function cancelSnapshot<T>(node: ReturnType<typeof state<ActionSnapshot<T>>>): void {
  node.value = { ...node.value, status: 'cancelled', running: false, queued: false, finishedAt: Date.now() };
}

function updateProgress<T>(
  node: ReturnType<typeof state<ActionSnapshot<T>>>,
  executionGeneration: number,
  currentGeneration: number,
  progress: ActionProgress
): void {
  if (executionGeneration === currentGeneration) node.value = { ...node.value, progress };
}

function normalizeProgress(progress: ActionProgress): ActionProgress {
  if (!Number.isFinite(progress.loaded) || progress.loaded < 0) throw new TypeError('Action progress.loaded must be non-negative.');
  if (progress.total !== undefined && (!Number.isFinite(progress.total) || progress.total < progress.loaded)) {
    throw new TypeError('Action progress.total must be finite and greater than or equal to loaded.');
  }
  return { loaded: progress.loaded, ...(progress.total !== undefined ? { total: progress.total } : {}), ...(progress.message ? { message: progress.message } : {}) };
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function retryDelay<TArgs extends unknown[]>(attempt: number, options: ActionOptions<TArgs>): number {
  const base = typeof options.retryDelayMs === 'number' && options.retryDelayMs >= 0 ? options.retryDelayMs : 250;
  return options.retryBackoff === 'fixed' ? base : base * 2 ** Math.max(0, attempt - 1);
}

function defaultRetryable(error: ActionError): boolean {
  return error.code === 'NETWORK' || error.code === 'TIMEOUT' || error.name === 'TypeError';
}

function isOffline(queue: NonNullable<ActionOptions['queue']>, error: ActionError): boolean {
  return !queue.isOnline() || error.code === 'NETWORK' || error.name === 'TypeError';
}

function wait(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, delay);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

function createIdempotencyKey(name: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${name}:${random}`;
}

function linkSignals(first: AbortSignal, second: AbortSignal): AbortController {
  const controller = new AbortController();
  const abort = (signal: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  if (first.aborted) abort(first);
  else first.addEventListener('abort', () => abort(first), { once: true });
  if (second.aborted) abort(second);
  else second.addEventListener('abort', () => abort(second), { once: true });
  return controller;
}
