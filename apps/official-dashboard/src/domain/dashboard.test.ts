import { describe, expect, it } from 'vitest';
import { canSuspend, filterUsers, summarizeMetrics } from './dashboard.js';

describe('official dashboard domain', () => {
  it('summarizes metrics deterministically', () => {
    expect(summarizeMetrics([{ at: '1', revenue: 10, users: 2 }, { at: '2', revenue: 20, users: 5 }])).toEqual({ revenue: 30, users: 5 });
  });
  it('filters and enforces permission rules', () => {
    expect(filterUsers([{ id: '1', name: 'Ada', role: 'admin', status: 'active' }], 'ada')).toHaveLength(1);
    expect(canSuspend('admin', 'viewer')).toBe(true);
    expect(canSuspend('admin', 'admin')).toBe(false);
  });
});
