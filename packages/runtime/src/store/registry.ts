import type {
  StoreDefinition,
  StoreLease,
  StoreLifetime,
  StoreRegistryOptions
} from './types.js';

interface StoreEntry<TStore = unknown> {
  definition: StoreDefinition<TStore>;
  value: TStore;
  controller: AbortController;
  references: number;
  scopeId: string;
  disposed: boolean;
}

export class StoreRegistry {
  private readonly definitions = new Map<string, StoreDefinition<unknown>>();
  private readonly entries = new Map<string, StoreEntry>();
  private readonly scopes: Required<StoreRegistryOptions>;
  private disposed = false;

  constructor(options: StoreRegistryOptions = {}) {
    this.scopes = {
      applicationId: options.applicationId ?? 'application',
      sessionId: options.sessionId ?? 'session',
      routeId: options.routeId ?? 'route',
      requestId: options.requestId ?? 'request'
    };
  }

  register<TStore>(definition: StoreDefinition<TStore>): void {
    this.assertActive();
    if (this.definitions.has(definition.key)) throw new Error(`Store '${definition.key}' is already registered.`);
    this.definitions.set(definition.key, definition as StoreDefinition<unknown>);
  }

  acquire<TStore>(key: string, lifetime: StoreLifetime, ownerId: string): StoreLease<TStore> {
    this.assertActive();
    const definition = this.definitions.get(key) as StoreDefinition<TStore> | undefined;
    if (!definition) throw new Error(`Store '${key}' has not been registered.`);
    if (definition.lifetime !== lifetime) {
      throw new Error(`Store '${key}' declares lifetime '${definition.lifetime}', but the component requested '${lifetime}'.`);
    }

    const scopeId = this.resolveScopeId(lifetime, ownerId);
    const entryKey = `${lifetime}:${scopeId}:${key}`;
    let entry = this.entries.get(entryKey) as StoreEntry<TStore> | undefined;
    if (!entry) {
      const controller = new AbortController();
      entry = {
        definition,
        value: definition.create({ lifetime, scopeId, signal: controller.signal }),
        controller,
        references: 0,
        scopeId,
        disposed: false
      };
      this.entries.set(entryKey, entry as StoreEntry);
    }
    entry.references += 1;
    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        entry!.references = Math.max(0, entry!.references - 1);
        if (isAutomaticallyReleased(lifetime) && entry!.references === 0) this.disposeEntry(entryKey, entry!);
      }
    };
  }

  disposeLifetime(lifetime: StoreLifetime, scopeId?: string): void {
    this.assertActive();
    const errors: unknown[] = [];
    for (const [entryKey, entry] of [...this.entries]) {
      if (entry.definition.lifetime !== lifetime) continue;
      if (scopeId !== undefined && entry.scopeId !== scopeId) continue;
      try {
        this.disposeEntry(entryKey, entry);
      } catch (error) {
        errors.push(error);
      }
    }
    throwDisposalErrors(errors, `Failed to dispose '${lifetime}' stores.`);
  }

  dispose(): void {
    if (this.disposed) return;
    const errors: unknown[] = [];
    for (const [entryKey, entry] of [...this.entries]) {
      try {
        this.disposeEntry(entryKey, entry);
      } catch (error) {
        errors.push(error);
      }
    }
    this.definitions.clear();
    this.disposed = true;
    throwDisposalErrors(errors, 'Failed to dispose the store registry.');
  }

  private resolveScopeId(lifetime: StoreLifetime, ownerId: string): string {
    switch (lifetime) {
      case 'component':
      case 'tree':
      case 'manual':
        if (!ownerId) throw new Error(`Store lifetime '${lifetime}' requires an explicit owner id.`);
        return ownerId;
      case 'route':
        return this.scopes.routeId;
      case 'session':
        return this.scopes.sessionId;
      case 'application':
        return this.scopes.applicationId;
      case 'request':
        return this.scopes.requestId;
    }
  }

  private disposeEntry<TStore>(key: string, entry: StoreEntry<TStore>): void {
    if (entry.disposed) return;
    entry.disposed = true;
    this.entries.delete(key);
    entry.controller.abort(new DOMException(`Store '${entry.definition.key}' disposed`, 'AbortError'));
    if (entry.definition.dispose) entry.definition.dispose(entry.value);
    else (entry.value as { dispose?: () => void }).dispose?.();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('StoreRegistry has been disposed.');
  }
}

function isAutomaticallyReleased(lifetime: StoreLifetime): boolean {
  return lifetime === 'component' || lifetime === 'tree';
}


function throwDisposalErrors(errors: readonly unknown[], message: string): void {
  if (errors.length === 0) return;
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, message);
}
