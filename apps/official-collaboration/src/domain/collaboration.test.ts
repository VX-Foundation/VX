import { describe, expect, it } from 'vitest';
import { applyEdit, mergePresence, resolveConflict } from './collaboration.js';

describe('official collaboration domain', () => {
  it('accepts matching edits and exposes version conflicts', () => {
    const document = { id: 'doc', version: 2, body: 'remote', updatedBy: 'ada' };
    expect(applyEdit(document, { id: 'e1', baseVersion: 2, body: 'local', actorId: 'grace' }).kind).toBe('accepted');
    const conflict = applyEdit(document, { id: 'e2', baseVersion: 1, body: 'stale', actorId: 'grace' });
    expect(conflict.kind).toBe('conflict');
    expect(resolveConflict({ id: 'e2', baseVersion: 1, body: 'stale', actorId: 'grace' }, document, 'remote')).toEqual(document);
  });
  it('keeps the newest presence timestamp', () => {
    const first = mergePresence(new Map(), 'ada', 10);
    expect(mergePresence(first, 'ada', 5).get('ada')).toBe(10);
  });
});
