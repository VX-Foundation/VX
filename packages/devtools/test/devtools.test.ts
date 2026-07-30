import { describe, expect, it } from 'vitest';
import { createDevtoolsBridge } from '../src/index.js';

describe('VX DevTools bridge', () => {
  it('tracks components, state, metrics, and redacted payloads', () => {
    const bridge = createDevtoolsBridge('app');
    bridge.register({ id: 'component:1', category: 'component', name: 'Home' });
    bridge.register({ id: 'state:1', category: 'state', name: 'count', componentId: 'component:1', value: 1 });
    bridge.measure({ category: 'performance', name: 'render', value: 2, unit: 'ms' });
    bridge.emit('server-payload', 'snapshot', 'payload:1', { token: 'secret', data: 1 });
    const snapshot = bridge.snapshot();
    expect(snapshot.entities).toHaveLength(2);
    expect(snapshot.metrics[0]?.name).toBe('render');
    expect(snapshot.serverPayloads[0]?.payload).toEqual({ token: '[redacted]', data: 1 });
  });
});
