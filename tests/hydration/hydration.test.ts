import { describe, expect, it } from 'vitest';
import { compareHydrationMarkup, testHydration } from '@vx-foundation/testing';

describe('official hydration testing', () => {
  it('reports deterministic mismatch guidance', async () => {
    let client = '<p>server</p>';
    const matched = await testHydration({ serverMarkup: client, hydrate() {}, readClientMarkup: () => client });
    expect(matched.matched).toBe(true);
    client = '<p>client</p>';
    const mismatch = compareHydrationMarkup('<p>server</p>', client);
    expect(mismatch.matched).toBe(false);
    expect(mismatch.mismatches[0]?.suggestion).toContain('deterministic');
  });
});
