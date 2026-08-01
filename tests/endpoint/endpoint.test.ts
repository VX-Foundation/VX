import { describe, expect, it } from 'vitest';
import { invokeEndpoint } from '@vx-foundation/testing';

describe('official endpoint testing', () => {
  it('uses real Request and Response objects', async () => {
    const result = await invokeEndpoint((request) => Response.json({ path: new URL(request.url).pathname }), new Request('https://vx.test/api/items'));
    expect(result.response?.status).toBe(200);
    await expect(result.response?.json()).resolves.toEqual({ path: '/api/items' });
  });
});
