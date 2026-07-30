import { describe, expect, it } from 'vitest';
import { QueryClient, createAction, createQuery, runActionBatch } from '../src/client.js';

describe('VX managed data runtime', () => {
  it('cancels an offline-paused query before it can execute', async () => {
    let executions = 0;
    const client = new QueryClient({ online: () => false });
    const resource = createQuery(client, {
      name: 'offline-profile',
      input: () => 1,
      source: async () => { executions += 1; return { id: 1 }; },
      policy: { networkMode: 'online' }
    });
    expect(resource.paused).toBe(true);
    resource.dispose();
    client.setOnline(true);
    await Promise.resolve();
    expect(executions).toBe(0);
    client.dispose();
  });

  it('invalidates query tags after a successful action', async () => {
    const client = new QueryClient();
    client.setData(['projects'], [{ id: 1 }], { tags: ['projects'] });
    const action = createAction(async (context) => {
      context.reportProgress({ loaded: 1, total: 1 });
      context.invalidateTags(['projects']);
      return 'saved';
    }, { name: 'save-project', queryClient: client });
    await expect(action()).resolves.toBe('saved');
    expect(action.progress).toEqual({ loaded: 1, total: 1 });
    expect(client.getSnapshot(['projects'])?.invalidated).toBe(true);
  });

  it('accepts typed query resources in action invalidation and refresh', async () => {
    const client = new QueryClient();
    const resource = createQuery(client, {
      name: 'typed-project',
      input: () => ({ id: 'vx' }),
      source: async ({ id }) => ({ id, version: 1 }),
      initialData: { id: 'vx', version: 0 }
    });
    const action = createAction(async (context) => {
      context.invalidate(resource);
      context.refresh(resource);
      return resource.data;
    }, { name: 'typed-project.refresh', queryClient: client });
    await expect(action()).resolves.toEqual({ id: 'vx', version: 0 });
    await Promise.resolve();
    resource.dispose();
    client.dispose();
  });

  it('returns partial batch results without sparse arrays', async () => {
    const result = await runActionBatch([
      async () => 1,
      async () => { throw new Error('failed'); },
      async () => 3
    ], { concurrency: 2 });
    expect(result.status).toBe('partial');
    expect(result.values).toEqual([1, undefined, 3]);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[1]?.message).toBe('failed');
  });
});
