import assert from 'node:assert/strict';
import { installFakeDom, FakeElement, FakeText } from './test-support/fake-dom.mjs';

installFakeDom();
globalThis.Document = document.constructor;
globalThis.Text = FakeText;
const originalCreateElement = document.createElement.bind(document);
document.createElement = (tag) => {
  const element = originalCreateElement(tag);
  element.localName = tag;
  element.namespaceURI = 'http://www.w3.org/1999/xhtml';
  element.ownerDocument = document;
  return element;
};
document.createElementNS = (namespace, tag) => {
  const element = document.createElement(tag);
  element.namespaceURI = namespace;
  return element;
};
FakeElement.prototype.setAttributeNS = function(namespace, name, value) {
  this._namespaced ??= new Map();
  this._namespaced.set(`${namespace}:${name.includes(':') ? name.split(':').at(-1) : name}`, String(value));
  this.setAttribute(name, value);
};
FakeElement.prototype.getAttributeNS = function(namespace, name) { return this._namespaced?.get(`${namespace}:${name}`) ?? null; };
FakeElement.prototype.removeAttributeNS = function(namespace, name) { this._namespaced?.delete(`${namespace}:${name}`); };

const runtime = await import('../packages/runtime/dist/client.js');
const server = await import('../packages/runtime/dist/server.js');

const order = [];
runtime.scheduleTask(() => order.push('idle'), { priority: 'idle' });
runtime.scheduleTask(() => order.push('transition'), { priority: 'transition' });
runtime.scheduleTask(() => order.push('immediate'), { priority: 'immediate' });
const cancelled = runtime.scheduleTask(() => order.push('cancelled'), { priority: 'normal' });
cancelled.cancel();
runtime.flushScheduler();
await cancelled.finished;
assert.deepEqual(order, ['immediate', 'transition', 'idle']);
assert.equal(cancelled.state, 'cancelled');

const value = runtime.state(0);
let observed = -1;
const subscription = runtime.effect(() => { observed = value.value; });
runtime.startTransition(() => runtime.batch(() => { value.value = 1; value.value = 2; }));
runtime.flushScheduler();
assert.equal(observed, 2);
subscription.dispose();

const cleanupOrder = [];
const stack = runtime.createCleanupStack('phase15-verifier');
stack.push(() => cleanupOrder.push(1), () => cleanupOrder.push(2));
assert.ok(runtime.inspectRuntimeLeaks().some((leak) => leak.ownerLabel === 'phase15-verifier'));
runtime.disposeCleanupStack(stack);
assert.deepEqual(cleanupOrder, [2, 1]);
assert.ok(!runtime.inspectRuntimeLeaks().some((leak) => leak.ownerLabel === 'phase15-verifier'));

const svg = runtime.createDOMElement('svg');
const circle = runtime.createDOMElement('circle', { parent: svg });
const math = runtime.createDOMElement('math');
assert.equal(svg.namespaceURI, runtime.DOM_NAMESPACES.svg);
assert.equal(circle.namespaceURI, runtime.DOM_NAMESPACES.svg);
assert.equal(math.namespaceURI, runtime.DOM_NAMESPACES.mathml);
runtime.setDOMAttributeNS(circle, 'xlink:href', '#shape');
assert.equal(circle.getAttributeNS(runtime.DOM_NAMESPACES.xlink, 'href'), '#shape');

let reverseCount = 0;
let cancelCount = 0;
let finishAnimation;
const element = document.createElement('div');
element.animate = () => ({
  finished: new Promise((resolve) => { finishAnimation = resolve; }),
  cancel() { cancelCount += 1; finishAnimation(); },
  reverse() { reverseCount += 1; }
});
const exiting = runtime.transitionElement(element, 'exit', 'fade');
const entering = runtime.transitionElement(element, 'enter', 'fade');
assert.equal(entering, exiting);
assert.equal(reverseCount, 1);
entering.cancel();
await entering.finished;
assert.equal(cancelCount, 1);

const hydrationRoot = document.createElement('main');
const wrong = document.createElement('span');
wrong.setAttribute('data-vx-source', 'title');
hydrationRoot.appendChild(wrong);
const diagnostics = [];
const registry = runtime.createHydrationRegistry(hydrationRoot, { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code) });
assert.equal(registry.claimElement('title', 'h1'), undefined);
assert.ok(diagnostics.includes('VX_HYDRATION_TAG_MISMATCH'));
registry.dispose();

const requestRuntime = server.createRequestRuntime({ requestId: 'phase15', routeId: 'home' });
const context = server.createServerRenderContext({
  runtime: requestRuntime,
  routeId: 'home',
  requestURL: new URL('https://vx.test/'),
  hydration: 'full',
  nonce: 'strict-csp'
});
const deterministic = server.renderElement('div', { z: 1, style: { zIndex: 2, color: 'red' }, a: 2 }, 'content', 'source');
assert.equal(deterministic, '<div a="2" data-vx-source="source" style="color:red;z-index:2" z="1">content</div>');
const boundary = server.renderResumableBoundary(context, 'counter', { count: 7 }, deterministic);
const documentResult = server.renderDocument({ context, html: boundary, clientEntry: '/client.js' });
assert.match(documentResult.html, /vx:resume:vxr-home-0:start/);
assert.match(documentResult.html, /"resumable"/);
assert.match(documentResult.html, /nonce="strict-csp"/);
requestRuntime.dispose();

console.log('Phase 15 runtime verification passed (scheduler, ownership, DOM namespaces, transitions, hydration diagnostics, deterministic SSR, resumable state, and strict CSP).');
