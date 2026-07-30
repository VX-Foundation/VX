export interface VersionedDocument { id: string; version: number; body: string; updatedBy: string; }
export interface EditOperation { id: string; baseVersion: number; body: string; actorId: string; }

export type ConflictResolution =
  | { kind: 'accepted'; document: VersionedDocument }
  | { kind: 'conflict'; local: EditOperation; remote: VersionedDocument };

export function applyEdit(document: VersionedDocument, edit: EditOperation): ConflictResolution {
  if (edit.baseVersion !== document.version) return { kind: 'conflict', local: edit, remote: document };
  return {
    kind: 'accepted',
    document: { ...document, version: document.version + 1, body: edit.body, updatedBy: edit.actorId }
  };
}

export function resolveConflict(local: EditOperation, remote: VersionedDocument, strategy: 'local' | 'remote'): VersionedDocument {
  return strategy === 'remote'
    ? remote
    : { ...remote, version: remote.version + 1, body: local.body, updatedBy: local.actorId };
}

export function mergePresence(current: ReadonlyMap<string, number>, userId: string, seenAt: number): ReadonlyMap<string, number> {
  const next = new Map(current);
  next.set(userId, Math.max(seenAt, next.get(userId) ?? 0));
  return next;
}
