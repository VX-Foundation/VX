import { batch, effect, type Effect } from './state.js';
import type { SchedulerPriority } from './scheduler.js';

export type EffectCleanup = () => void;

export interface ManagedEffectContext {
  readonly signal: AbortSignal;
  onCleanup(cleanup: EffectCleanup): void;
  commit(operation: () => void): boolean;
}

export interface ManagedEffectOptions {
  name?: string;
  onError?: (error: unknown, name: string | undefined) => void;
  priority?: SchedulerPriority;
}

export interface ManagedEffect extends Effect {
  readonly signal: AbortSignal;
}

export function managedEffect(
  run: (context: ManagedEffectContext) => void | EffectCleanup | Promise<void | EffectCleanup>,
  options: ManagedEffectOptions = {}
): ManagedEffect {
  let controller = new AbortController();
  let cleanups: EffectCleanup[] = [];
  let generation = 0;

  const base = effect(() => {
    const activeGeneration = ++generation;
    controller.abort(new DOMException('Effect execution superseded', 'AbortError'));
    runCleanups(cleanups);
    cleanups = [];
    const executionController = new AbortController();
    controller = executionController;
    const context: ManagedEffectContext = {
      signal: executionController.signal,
      onCleanup(cleanup) {
        if (activeGeneration !== generation || executionController.signal.aborted) cleanup();
        else cleanups.push(cleanup);
      },
      commit(operation) {
        if (activeGeneration !== generation || executionController.signal.aborted) return false;
        batch(operation);
        return true;
      }
    };

    try {
      const result = run(context);
      if (typeof result === 'function') cleanups.push(result);
      else if (isPromiseLike(result)) {
        void result.then(
          (cleanup) => {
            if (typeof cleanup !== 'function') return;
            if (activeGeneration !== generation || controller.signal.aborted) cleanup();
            else cleanups.push(cleanup);
          },
          (error: unknown) => {
            if (activeGeneration === generation && !executionController.signal.aborted) {
              reportError(error, options);
            }
          }
        );
      }
    } catch (error) {
      reportError(error, options);
    }
  }, {
    ...(options.priority ? { priority: options.priority } : {}),
    ...(options.name ? { label: options.name } : {}),
    onError: (error) => reportError(error, options)
  });

  return {
    update: base.update,
    get active() { return base.active; },
    get priority() { return base.priority; },
    get signal() { return controller.signal; },
    dispose() {
      if (!base.active) return;
      generation += 1;
      controller.abort(new DOMException('Effect disposed', 'AbortError'));
      runCleanups(cleanups);
      cleanups = [];
      base.dispose();
    }
  };
}

function runCleanups(cleanups: readonly EffectCleanup[]): void {
  for (const cleanup of [...cleanups].reverse()) {
    try {
      cleanup();
    } catch (error) {
      queueMicrotask(() => { throw error; });
    }
  }
}

function reportError(error: unknown, options: ManagedEffectOptions): void {
  if (options.onError) options.onError(error, options.name);
  else queueMicrotask(() => { throw error; });
}

function isPromiseLike(value: unknown): value is Promise<void | EffectCleanup> {
  return Boolean(value && typeof (value as Promise<unknown>).then === 'function');
}
