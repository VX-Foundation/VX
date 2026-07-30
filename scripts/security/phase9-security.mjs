import assert from 'node:assert/strict';
import {
  createCsrfToken,
  deserializeServerValue,
  dispatchServerAction,
  registerServerAction,
  sanitizeURLAttribute,
  serializeServerValue,
  verifyCsrfToken
} from '../../packages/runtime/dist/server.js';

assert.equal(sanitizeURLAttribute('java\u0000script:alert(1)', { attribute: 'href', tagName: 'a' }), undefined);
assert.equal(sanitizeURLAttribute(' JAVASCRIPT:alert(1)', { attribute: 'href', tagName: 'a' }), undefined);
assert.equal(sanitizeURLAttribute('data:text/html;base64,PHNjcmlwdD4=', { attribute: 'src', tagName: 'img' }), undefined);
assert.equal(sanitizeURLAttribute('https://vx.dev/docs', { attribute: 'href', tagName: 'a' }), 'https://vx.dev/docs');

const dangerous = '</script><script>globalThis.__vxOwned = true</script>\u2028';
const serialized = serializeServerValue({ dangerous });
assert.ok(!serialized.includes('</script>'));
assert.equal(deserializeServerValue(serialized).dangerous, dangerous);
assert.throws(() => deserializeServerValue('{"version":1,"value":{"__proto__":{"polluted":true}}}'));
assert.throws(() => deserializeServerValue(JSON.stringify({ version: 1, value: nested(110) })));
assert.equal({}.polluted, undefined);

const secret = 'phase9-test-secret-that-is-at-least-thirty-two-bytes';
const csrf = await createCsrfToken({ secret, binding: 'session-a', now: 1_000_000 });
assert.equal(await verifyCsrfToken(csrf, { secret, binding: 'session-a', now: 1_000_001 }), true);
assert.equal(await verifyCsrfToken(csrf, { secret, binding: 'session-b', now: 1_000_001 }), false);
assert.equal(csrf.includes('session-a'), false);

const contract = {
  id: 'phase9.secure-action', name: 'secureAction',
  parameters: [{ name: 'value', type: 'String', optional: false }],
  returnType: 'String', authorization: 'authenticated', csrf: 'required'
};
registerServerAction(contract, (value) => `first:${value}`);
registerServerAction(contract, (value) => `second:${value}`);
assert.throws(() => registerServerAction({ ...contract, returnType: 'Int' }, () => 1), /different contract/);

const origin = 'https://app.vx.test';
const request = (headers = {}, body = JSON.stringify({ args: ['ok'] })) => new Request(`${origin}/_vx/rpc/phase9.secure-action`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body
});
let response = await dispatchServerAction(request(), { expectedOrigin: origin, sessionId: 'session-a' });
assert.equal(response.status, 403);
response = await dispatchServerAction(request(), {
  expectedOrigin: origin, sessionId: 'session-a', verifyCsrf: () => true
});
assert.equal(response.status, 200);
assert.match(await response.text(), /second:ok/);
response = await dispatchServerAction(new Request(`${origin}/_vx/rpc/phase9.secure-action`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' }, body: JSON.stringify({ args: ['ok'] })
}), { expectedOrigin: origin, sessionId: 'session-a', verifyCsrf: () => true });
assert.equal(response.status, 403);
response = await dispatchServerAction(request({ 'content-encoding': 'gzip' }), {
  expectedOrigin: origin, sessionId: 'session-a', verifyCsrf: () => true
});
assert.equal(response.status, 400);

console.log('Phase 9 security verification passed.');

function nested(depth) {
  let value = 'leaf';
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}
