/** Deterministic resource ownership and development-time leak diagnostics. */

export type ResourceCleanup = () => void;

export interface OwnedResourceSnapshot {
  readonly id: number;
  readonly label: string;
  readonly createdAt: number;
  readonly stack?: string;
}

export interface ResourceOwnerSnapshot {
  readonly id: number;
  readonly label: string;
  readonly active: boolean;
  readonly parentId?: number;
  readonly resources: readonly OwnedResourceSnapshot[];
  readonly children: readonly ResourceOwnerSnapshot[];
}

export interface LeakDiagnostic {
  readonly ownerId: number;
  readonly ownerLabel: string;
  readonly resources: readonly OwnedResourceSnapshot[];
}

export interface LeakDetectionOptions {
  captureStacks?: boolean;
  onLeak?: (diagnostic: LeakDiagnostic) => void;
}

export interface ResourceLease {
  readonly active: boolean;
  release(): void;
}

export interface ResourceOwner {
  readonly id: number;
  readonly label: string;
  readonly active: boolean;
  own(cleanup: ResourceCleanup, label?: string): ResourceLease;
  child(label: string): ResourceOwner;
  dispose(): void;
  snapshot(): ResourceOwnerSnapshot;
}

export interface CleanupStack extends Iterable<ResourceCleanup> {
  readonly size: number;
  push(...cleanups: ResourceCleanup[]): number;
  dispose(): void;
}

interface ResourceRecord {
  id: number;
  label: string;
  cleanup: ResourceCleanup;
  createdAt: number;
  stack?: string;
  active: boolean;
}

interface OwnerRecord {
  id: number;
  label: string;
  parent?: OwnerRecord;
  children: Set<OwnerRecord>;
  resources: Map<number, ResourceRecord>;
  active: boolean;
}

let nextOwnerId = 1;
let nextResourceId = 1;
let currentOwner: OwnerRecord | undefined;
let leakOptions: LeakDetectionOptions | undefined;
const rootOwners = new Set<OwnerRecord>();

export function createResourceOwner(label = 'runtime', parent?: ResourceOwner): ResourceOwner {
  const parentRecord = parent ? unwrapOwner(parent) : currentOwner;
  const record: OwnerRecord = {
    id: nextOwnerId++,
    label,
    ...(parentRecord ? { parent: parentRecord } : {}),
    children: new Set(),
    resources: new Map(),
    active: true
  };
  if (parentRecord) {
    if (!parentRecord.active) throw new Error(`Cannot create a child resource owner under disposed owner '${parentRecord.label}'.`);
    parentRecord.children.add(record);
  } else rootOwners.add(record);
  return wrapOwner(record);
}

export function runWithOwner<T>(owner: ResourceOwner, operation: () => T): T {
  const record = unwrapOwner(owner);
  if (!record.active) throw new Error(`Cannot enter disposed resource owner '${record.label}'.`);
  const previous = currentOwner;
  currentOwner = record;
  try {
    return operation();
  } finally {
    currentOwner = previous;
  }
}

export function getCurrentOwner(): ResourceOwner | undefined {
  return currentOwner ? wrapOwner(currentOwner) : undefined;
}

export function onOwnerCleanup(cleanup: ResourceCleanup, label?: string): ResourceLease {
  if (!currentOwner) throw new Error('VX onOwnerCleanup() requires an active resource owner.');
  return ownResource(currentOwner, cleanup, label);
}

export function createCleanupStack(label = 'cleanup-stack', parent?: ResourceOwner): CleanupStack {
  const owner = createResourceOwner(label, parent);
  const entries: ResourceCleanup[] = [];
  let disposed = false;
  return {
    get size() { return entries.length; },
    push(...cleanups) {
      if (disposed) {
        for (const cleanup of cleanups) cleanup();
        return entries.length;
      }
      for (const cleanup of cleanups) {
        if (typeof cleanup !== 'function') throw new TypeError('VX cleanup stacks accept functions only.');
        const lease = owner.own(cleanup, `cleanup:${entries.length}`);
        let active = true;
        entries.push(() => {
          if (!active) return;
          active = false;
          lease.release();
        });
      }
      return entries.length;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      owner.dispose();
      entries.length = 0;
    },
    *[Symbol.iterator]() { yield* entries; }
  };
}

export function disposeCleanupStack(cleanups: CleanupStack | Iterable<ResourceCleanup>): void {
  if (isCleanupStack(cleanups)) {
    cleanups.dispose();
    return;
  }
  const errors: unknown[] = [];
  for (const cleanup of [...cleanups].reverse()) {
    try { cleanup(); } catch (error) { errors.push(error); }
  }
  throwCleanupErrors(errors);
}

export function enableLeakDetection(options: LeakDetectionOptions = {}): () => void {
  leakOptions = { ...options };
  return () => { leakOptions = undefined; };
}

export function inspectRuntimeLeaks(): readonly LeakDiagnostic[] {
  const leaks: LeakDiagnostic[] = [];
  for (const owner of rootOwners) collectLeaks(owner, leaks);
  return Object.freeze(leaks);
}

export function reportRuntimeLeaks(): readonly LeakDiagnostic[] {
  const leaks = inspectRuntimeLeaks();
  for (const leak of leaks) leakOptions?.onLeak?.(leak);
  return leaks;
}

export function assertNoRuntimeLeaks(): void {
  const leaks = reportRuntimeLeaks();
  if (leaks.length === 0) return;
  const details = leaks
    .map((leak) => `${leak.ownerLabel} (${leak.resources.map((resource) => resource.label).join(', ') || 'child owners'})`)
    .join('; ');
  throw new Error(`VX runtime leak detection found active resources: ${details}`);
}

function wrapOwner(record: OwnerRecord): ResourceOwner {
  const owner: ResourceOwner & { readonly __vxOwnerRecord?: OwnerRecord } = {
    get id() { return record.id; },
    get label() { return record.label; },
    get active() { return record.active; },
    own(cleanup, label) { return ownResource(record, cleanup, label); },
    child(label) {
      if (!record.active) throw new Error(`Cannot create a child under disposed resource owner '${record.label}'.`);
      return createResourceOwner(label, owner);
    },
    dispose() { disposeOwner(record); },
    snapshot() { return snapshotOwner(record); }
  };
  Object.defineProperty(owner, '__vxOwnerRecord', { value: record });
  return owner;
}

function unwrapOwner(owner: ResourceOwner): OwnerRecord {
  const record = (owner as ResourceOwner & { readonly __vxOwnerRecord?: OwnerRecord }).__vxOwnerRecord;
  if (!record) throw new TypeError('Invalid VX resource owner.');
  return record;
}

function ownResource(record: OwnerRecord, cleanup: ResourceCleanup, label = 'resource'): ResourceLease {
  if (typeof cleanup !== 'function') throw new TypeError('Owned VX resources require a cleanup function.');
  if (!record.active) {
    cleanup();
    return { active: false, release() {} };
  }
  const resource: ResourceRecord = {
    id: nextResourceId++,
    label,
    cleanup,
    createdAt: Date.now(),
    ...(leakOptions?.captureStacks ? { stack: new Error().stack } : {}),
    active: true
  };
  record.resources.set(resource.id, resource);
  return {
    get active() { return resource.active; },
    release() { releaseResource(record, resource); }
  };
}

function releaseResource(owner: OwnerRecord, resource: ResourceRecord): void {
  if (!resource.active) return;
  resource.active = false;
  owner.resources.delete(resource.id);
  resource.cleanup();
}

function disposeOwner(record: OwnerRecord): void {
  if (!record.active) return;
  record.active = false;
  const errors: unknown[] = [];
  for (const child of [...record.children].reverse()) {
    try { disposeOwner(child); } catch (error) { errors.push(error); }
  }
  for (const resource of [...record.resources.values()].reverse()) {
    try { releaseResource(record, resource); } catch (error) { errors.push(error); }
  }
  record.children.clear();
  record.parent?.children.delete(record);
  if (!record.parent) rootOwners.delete(record);
  throwCleanupErrors(errors);
}

function snapshotOwner(record: OwnerRecord): ResourceOwnerSnapshot {
  return Object.freeze({
    id: record.id,
    label: record.label,
    active: record.active,
    ...(record.parent ? { parentId: record.parent.id } : {}),
    resources: Object.freeze([...record.resources.values()].filter((item) => item.active).map(snapshotResource)),
    children: Object.freeze([...record.children].map(snapshotOwner))
  });
}

function snapshotResource(resource: ResourceRecord): OwnedResourceSnapshot {
  return Object.freeze({
    id: resource.id,
    label: resource.label,
    createdAt: resource.createdAt,
    ...(resource.stack ? { stack: resource.stack } : {})
  });
}

function leakDiagnostic(record: OwnerRecord): LeakDiagnostic {
  return Object.freeze({
    ownerId: record.id,
    ownerLabel: record.label,
    resources: Object.freeze([...record.resources.values()].filter((item) => item.active).map(snapshotResource))
  });
}

function collectLeaks(record: OwnerRecord, target: LeakDiagnostic[]): void {
  const diagnostic = leakDiagnostic(record);
  if (diagnostic.resources.length > 0) target.push(diagnostic);
  for (const child of record.children) collectLeaks(child, target);
}

function isCleanupStack(value: Iterable<ResourceCleanup>): value is CleanupStack {
  return typeof (value as Partial<CleanupStack>).dispose === 'function' && typeof (value as Partial<CleanupStack>).push === 'function';
}

function throwCleanupErrors(errors: readonly unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Failed to dispose VX runtime resources.');
}
