import type { ActionQueue, QueuedActionRequest } from '@vx-foundation/runtime';
import type { DataPersistenceAdapter } from './persistence.js';

export type MutationQueueStatus = 'queued' | 'running' | 'failed';

export interface OfflineMutation {
  id: string;
  action: string;
  args: readonly unknown[];
  idempotencyKey: string;
  createdAt: number;
  attempts: number;
  status: MutationQueueStatus;
  lastError?: string;
}

export interface OfflineMutationQueueOptions {
  adapter?: DataPersistenceAdapter;
  storageKey?: string;
  online?: () => boolean;
  execute?: (mutation: OfflineMutation, signal: AbortSignal) => Promise<unknown>;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryBackoff?: 'fixed' | 'exponential';
  conflict?: (mutation: OfflineMutation, error: unknown) => 'retry' | 'discard' | 'pause' | Promise<'retry' | 'discard' | 'pause'>;
  onError?: (error: unknown) => void;
}

export interface MutationQueueSnapshot {
  queued: number;
  running: boolean;
  paused: boolean;
  mutations: readonly OfflineMutation[];
}

export class OfflineMutationQueue implements ActionQueue {
  private readonly mutations: OfflineMutation[] = [];
  private readonly executors = new Map<string, (signal: AbortSignal) => Promise<unknown>>();
  private readonly listeners = new Set<(snapshot: MutationQueueSnapshot) => void>();
  private readonly completions = new Map<string, { value?: unknown; error?: unknown }>();
  private readonly storageKey: string;
  private readonly onlineProvider: () => boolean;
  private activeController: AbortController | undefined;
  private flushing: Promise<void> | undefined;
  private paused = false;
  private restored = false;

  constructor(private readonly options: OfflineMutationQueueOptions = {}) {
    this.storageKey = options.storageKey ?? 'vx:mutations';
    this.onlineProvider = options.online ?? defaultOnline;
  }

  isOnline(): boolean {
    return this.onlineProvider();
  }

  async restore(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    const value = await this.options.adapter?.read(this.storageKey);
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const mutation = validateMutation(item);
      if (mutation && !this.mutations.some((candidate) => candidate.idempotencyKey === mutation.idempotencyKey)) this.mutations.push(mutation);
    }
    this.emit();
  }

  async enqueue<TResult>(request: QueuedActionRequest<TResult>): Promise<TResult> {
    await this.restore();
    const existing = this.mutations.find((mutation) => mutation.idempotencyKey === request.idempotencyKey);
    const mutation = existing ?? {
      id: randomId(),
      action: request.action,
      args: normalizeArguments(request.args),
      idempotencyKey: request.idempotencyKey,
      createdAt: request.createdAt,
      attempts: 0,
      status: 'queued' as const
    };
    if (!existing) this.mutations.push(mutation);
    this.executors.set(mutation.id, request.execute as (signal: AbortSignal) => Promise<unknown>);
    await this.persist();
    this.emit();
    if (this.isOnline() && !this.paused) void this.flush();
    return new Promise<TResult>((resolve, reject) => {
      const unsubscribe = this.subscribe((snapshot) => {
        if (snapshot.mutations.some((item) => item.id === mutation.id)) return;
        unsubscribe();
        const completion = this.completions.get(mutation.id);
        this.completions.delete(mutation.id);
        if (completion?.error !== undefined) reject(completion.error);
        else resolve(completion?.value as TResult);
      });
    });
  }

  async flush(): Promise<void> {
    await this.restore();
    if (this.flushing) return this.flushing;
    this.flushing = this.runFlush().finally(() => { this.flushing = undefined; });
    return this.flushing;
  }

  pause(): void {
    this.paused = true;
    this.activeController?.abort(new DOMException('Offline mutation queue paused', 'AbortError'));
    this.emit();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.emit();
    if (this.isOnline()) void this.flush();
  }

  async discard(id: string): Promise<void> {
    const index = this.mutations.findIndex((mutation) => mutation.id === id);
    if (index < 0) return;
    this.mutations.splice(index, 1);
    this.executors.delete(id);
    await this.persist();
    this.emit();
  }

  subscribe(listener: (snapshot: MutationQueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): MutationQueueSnapshot {
    return {
      queued: this.mutations.length,
      running: Boolean(this.flushing),
      paused: this.paused,
      mutations: this.mutations.map((mutation) => ({ ...mutation }))
    };
  }

  dispose(): void {
    this.activeController?.abort(new DOMException('Offline mutation queue disposed', 'AbortError'));
    this.listeners.clear();
    this.executors.clear();
    this.completions.clear();
  }

  private async runFlush(): Promise<void> {
    while (!this.paused && this.isOnline()) {
      const mutation = this.mutations[0];
      if (!mutation) return;
      const execute = this.executors.get(mutation.id) ?? (this.options.execute ? (signal: AbortSignal) => this.options.execute!(mutation, signal) : undefined);
      if (!execute) return;
      mutation.status = 'running';
      mutation.attempts += 1;
      delete mutation.lastError;
      this.activeController = new AbortController();
      this.emit();
      try {
        const value = await execute(this.activeController.signal);
        this.completions.set(mutation.id, { value });
        this.mutations.shift();
        this.executors.delete(mutation.id);
        await this.persist();
        this.emit();
      } catch (error) {
        if (this.activeController.signal.aborted) return;
        mutation.status = 'failed';
        mutation.lastError = safeError(error);
        const resolution = await this.resolveFailure(mutation, error);
        if (resolution === 'discard') {
          this.completions.set(mutation.id, { error });
          this.mutations.shift();
          this.executors.delete(mutation.id);
          await this.persist();
          this.emit();
          continue;
        }
        if (resolution === 'pause') {
          this.paused = true;
          await this.persist();
          this.emit();
          return;
        }
        mutation.status = 'queued';
        await this.persist();
        this.emit();
        await wait(retryDelay(mutation.attempts, this.options));
      } finally {
        this.activeController = undefined;
      }
    }
  }

  private async resolveFailure(mutation: OfflineMutation, error: unknown): Promise<'retry' | 'discard' | 'pause'> {
    if (this.options.conflict) return this.options.conflict(mutation, error);
    const maxAttempts = Math.max(1, Math.floor(this.options.maxAttempts ?? 5));
    return mutation.attempts >= maxAttempts ? 'pause' : 'retry';
  }

  private async persist(): Promise<void> {
    if (!this.options.adapter) return;
    try {
      await this.options.adapter.write(this.storageKey, this.mutations.map(({ status: _status, ...mutation }) => ({ ...mutation, status: 'queued' })));
    } catch (error) {
      this.options.onError?.(error);
    }
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}


function normalizeArguments(args: readonly unknown[]): readonly unknown[] {
  let nodes = 0;
  const visit = (value: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 10_000) throw new TypeError('Offline mutation arguments exceed the supported node limit.');
    if (depth > 50) throw new TypeError('Offline mutation arguments exceed the supported nesting depth.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Offline mutation arguments cannot contain non-finite numbers.');
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1));
    if (!value || typeof value !== 'object') throw new TypeError(`Offline mutation arguments cannot contain ${typeof value} values.`);
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Offline mutation arguments must contain JSON-compatible structured values.');
    }
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new TypeError(`Offline mutation arguments contain forbidden key '${key}'.`);
      }
      output[key] = visit(item, depth + 1);
    }
    return output;
  };
  return args.map((value) => visit(value, 0));
}

function validateMutation(value: unknown): OfflineMutation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<OfflineMutation>;
  if (typeof item.id !== 'string' || typeof item.action !== 'string' || typeof item.idempotencyKey !== 'string' || !Array.isArray(item.args)) return undefined;
  return {
    id: item.id,
    action: item.action,
    args: normalizeArguments(item.args),
    idempotencyKey: item.idempotencyKey,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    attempts: typeof item.attempts === 'number' ? item.attempts : 0,
    status: 'queued',
    ...(typeof item.lastError === 'string' ? { lastError: item.lastError } : {})
  };
}

function retryDelay(attempt: number, options: OfflineMutationQueueOptions): number {
  const base = Math.max(0, options.retryDelayMs ?? 500);
  return options.retryBackoff === 'fixed' ? base : base * 2 ** Math.max(0, attempt - 1);
}

function wait(delay: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function safeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown mutation failure';
}

function defaultOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
