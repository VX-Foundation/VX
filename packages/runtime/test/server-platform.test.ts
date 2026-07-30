import { describe, expect, it } from 'vitest';
import {
  createCsrfToken,
  createRequestRuntime,
  createServerRenderContext,
  defineStore,
  deserializeServerValue,
  invokeServerAction,
  registerServerAction,
  renderDocument,
  serializeServerValue,
  verifyCsrfToken
} from '../src/server.js';

describe('server platform', () => {
  it('round-trips supported state without emitting executable script text', () => {
    const input = { text: '</script>', count: 7n, date: new Date('2026-07-28T00:00:00.000Z'), values: new Set(['a']) };
    const source = serializeServerValue(input);
    expect(source).not.toContain('</script>');
    const output = deserializeServerValue(source) as typeof input;
    expect(output.text).toBe(input.text);
    expect(output.count).toBe(7n);
    expect(output.date).toEqual(input.date);
    expect([...output.values]).toEqual(['a']);
  });

  it('rejects circular and prototype-polluting payloads', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => serializeServerValue(circular)).toThrow(/circular/);
    expect(() => deserializeServerValue('{"version":1,"value":{"__proto__":true}}')).toThrow(/forbidden/);
  });

  it('signs CSRF tokens against a session binding', async () => {
    const secret = 'runtime-server-platform-test-secret-at-least-32-bytes';
    const token = await createCsrfToken({ secret, binding: 'session', now: 1000 });
    expect(token).not.toContain(Buffer.from('session').toString('base64url'));
    await expect(verifyCsrfToken(token, { secret, binding: 'session', now: 1100 })).resolves.toBe(true);
    await expect(verifyCsrfToken(token, { secret, binding: 'other', now: 1100 })).resolves.toBe(false);
  });

  it('accepts owned and shared-buffer CSRF secrets without leaking BufferSource types', async () => {
    const shared = new SharedArrayBuffer(48);
    const secret = new Uint8Array(shared);
    secret.fill(7);
    const token = await createCsrfToken({ secret, binding: 'shared-session', now: 2000 });
    await expect(verifyCsrfToken(token, { secret, binding: 'shared-session', now: 2100 })).resolves.toBe(true);
  });

  it('enforces declared server-action return types', async () => {
    registerServerAction({
      id: 'runtime-test:bad-return', name: 'badReturn', parameters: [], returnType: 'Int',
      authorization: 'authenticated', csrf: 'required'
    }, async () => 'wrong');
    await expect(invokeServerAction('runtime-test:bad-return', [])).rejects.toThrow(/does not match 'Int'/);
  });

  it('disposes request-scoped resources idempotently', () => {
    const runtime = createRequestRuntime({ requestId: 'request-dispose', routeId: 'home' });
    runtime.dispose();
    expect(() => runtime.dispose()).not.toThrow();
  });

  it('continues request cleanup when a store disposer fails', () => {
    const runtime = createRequestRuntime({ requestId: 'request-failing-dispose', routeId: 'home' });
    runtime.stores.register(defineStore({
      key: 'failing-store', lifetime: 'request', create: () => ({}),
      dispose: () => { throw new Error('store cleanup failed'); }
    }));
    runtime.stores.acquire('failing-store', 'request', 'owner');
    expect(() => runtime.dispose()).toThrow(/store cleanup failed/);
    expect(() => runtime.queryClient.dehydrate()).toThrow(/disposed/);
    expect(() => runtime.dispose()).not.toThrow();
  });

  it('keeps server component cleanup owned by the render context', () => {
    const runtime = createRequestRuntime({ requestId: 'request-context-cleanup', routeId: 'home' });
    const context = createServerRenderContext({
      runtime, routeId: 'home', requestURL: new URL('https://vx.test/'), hydration: 'full', streaming: 'stream'
    });
    let cleaned = 0;
    context.onCleanup(() => { cleaned += 1; });
    expect(cleaned).toBe(0);
    context.dispose();
    expect(cleaned).toBe(1);
    context.dispose();
    expect(cleaned).toBe(1);
    runtime.dispose();
  });

  it('renders hydration state and matching CSP nonces', () => {
    const runtime = createRequestRuntime({ requestId: 'request', routeId: 'home' });
    const context = createServerRenderContext({
      runtime, routeId: 'home', requestURL: new URL('https://vx.test/'), hydration: 'full', nonce: 'nonce-value'
    });
    const document = renderDocument({ context, html: '<h1>Home</h1>', clientEntry: '/client.js' });
    expect(document.html).toContain('id="__VX_STATE__" nonce="nonce-value"');
    expect(document.html).toContain('src="/client.js" nonce="nonce-value"');
    runtime.dispose();
  });
});
