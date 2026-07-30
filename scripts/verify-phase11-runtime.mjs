import assert from 'node:assert/strict';
import {
  applyForwardedBindings,
  acquireComponentContext,
  componentModel,
  createComponentScope,
  disposeComponentScope,
  dynamicComponentMount,
  mountComponentScope,
  portalMount,
  provideComponentContext,
  state
} from '../packages/runtime/dist/client.js';
import { FakeElement, installFakeDom } from './test-support/fake-dom.mjs';

installFakeDom();


let emitted;
const uncontrolled = componentModel({}, 'value', () => 'initial', (_name, payload) => { emitted = payload; }, 'change');
uncontrolled.value = 'next';
assert.equal(uncontrolled.value, 'next');
assert.equal(emitted, 'next');
const controlled = componentModel({ value: 'external' }, 'value', () => 'fallback', (_name, payload) => { emitted = payload; }, 'change');
controlled.value = 'requested';
assert.equal(controlled.value, 'external');
assert.equal(emitted, 'requested');
uncontrolled.dispose();
controlled.dispose();

const parentScope = createComponentScope();
provideComponentContext(parentScope, 'theme', 'dark');
const childScope = createComponentScope(parentScope);
const theme = acquireComponentContext(childScope, 'theme', undefined, true);
assert.equal(theme.value.value, 'dark');
theme.release();

let queuedMounts = 0;
const host = new FakeElement('main');
const selected = state(null);
const cleanup = [];
const records = [];
const makeFactory = (name) => (_props, _runtime, _outputs, _content, _parts, options = {}) => {
  const node = new FakeElement('section');
  node.textContent = name;
  return {
    node,
    mount() { queuedMounts += 1; records.push(`mount:${name}`); },
    dispose() { records.push(`dispose:${name}`); node.remove(); }
  };
};
const firstFactory = makeFactory('first');
const secondFactory = makeFactory('second');

dynamicComponentMount(host, () => selected.value, { parentScope: childScope }, cleanup);
selected.value = firstFactory;
await settle();
assert.equal(queuedMounts, 0, 'dynamic components must not mount while the parent scope is detached');
mountComponentScope(childScope);
assert.equal(queuedMounts, 1);
assert.equal(host.textContent, 'first');
selected.value = secondFactory;
await settle();
assert.equal(queuedMounts, 2);
assert.equal(host.textContent, 'second');
assert(records.includes('dispose:first'));

let resolveStale;
const stalePromise = new Promise((resolve) => { resolveStale = resolve; });
selected.value = stalePromise;
await settle();
selected.value = firstFactory;
await settle();
resolveStale(secondFactory);
await settle();
assert.equal(host.textContent, 'first', 'obsolete asynchronous component resolutions must not replace the current instance');
const failingFactory = () => { throw new Error('factory failed'); };
const failureHost = new FakeElement('main');
const failureSelection = state(failingFactory);
const failureCleanup = [];
dynamicComponentMount(failureHost, () => failureSelection.value, {
  error: (error) => {
    const node = new FakeElement('span');
    node.textContent = error.message;
    return node;
  }
}, failureCleanup);
assert.equal(failureHost.textContent, 'factory failed');
for (const dispose of failureCleanup.reverse()) dispose();
failureSelection.dispose();

const targetA = new FakeElement('aside');
const targetB = new FakeElement('aside');
const portalTarget = state(targetA);
portalMount(() => portalTarget.value, () => {
  const node = new FakeElement('span');
  node.textContent = 'teleported';
  return node;
}, cleanup);
assert.equal(targetA.textContent, 'teleported');
portalTarget.value = targetB;
await settle();
assert.equal(targetA.textContent, '');
assert.equal(targetB.textContent, 'teleported');

const forwardedNode = new FakeElement('div');
forwardedNode.dataset.vxWidget = 'View';
let clicks = 0;
const releaseForwarding = applyForwardedBindings(forwardedNode, {
  attributes: { dataTestId: 'component' },
  events: { click: () => { clicks += 1; } },
  className: 'field active',
  style: { opacity: 0.5 }
});
assert.equal(forwardedNode.getAttribute('data-testid'), 'component');
assert(forwardedNode.classList.contains('field'));
assert.equal(forwardedNode.style.getPropertyValue('opacity'), '0.5');
forwardedNode.dispatch('click');
assert.equal(clicks, 1);
assert.throws(() => applyForwardedBindings(forwardedNode, { attributes: { innerHTML: '<b>unsafe</b>' } }), /Unsafe forwarded attribute/);
assert.throws(() => applyForwardedBindings(forwardedNode, { attributes: { onclick: 'unsafe()' } }), /Unsafe forwarded attribute/);
assert.throws(() => applyForwardedBindings(forwardedNode, { style: { behavior: 'url(test.htc)' } }), /Unsafe forwarded style/);
releaseForwarding();
assert.equal(forwardedNode.classList.contains('field'), false);

for (const dispose of cleanup.reverse()) dispose();
disposeComponentScope(childScope);
disposeComponentScope(parentScope);
assert(records.includes('dispose:second'));
assert.equal(targetB.textContent, '');

console.log('VX Phase 11 runtime verification passed (context, deferred mount, dynamic identity, portals, forwarding, security, and cleanup).');

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
