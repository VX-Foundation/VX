import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3, 'VX DevTools must use Manifest V3.');
assert.equal(manifest.devtools_page, 'devtools.html', 'VX DevTools must declare its DevTools entrypoint.');
assert.match(manifest.version, /^0\.2\.0(?:-|$)/u, 'VX DevTools must track the framework 0.2.0 line.');

for (const file of ['devtools.html', 'devtools.js', 'panel.html', 'panel.js', 'panel.css']) {
  readFileSync(resolve(root, file));
}

const createdPanels = [];
vm.runInNewContext(readFileSync(resolve(root, 'devtools.js'), 'utf8'), {
  chrome: { devtools: { panels: { create: (...args) => createdPanels.push(args) } } }
}, { filename: 'devtools.js' });
assert.deepEqual(createdPanels, [['VX', '', 'panel.html']], 'DevTools must register the VX panel.');

class Element {
  constructor(id = '') { this.id = id; this.textContent = ''; this.dataset = {}; this.children = []; this.listeners = new Map(); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  append(child) { this.children.push(child); }
  querySelectorAll(selector) { return selector === 'button' ? this.children : []; }
}
const elements = new Map(['status', 'summary', 'output', 'categories', 'refresh', 'pause'].map((id) => [`#${id}`, new Element(id)]));
const snapshot = {
  sequence: 4,
  entities: [{ id: 'component:1', category: 'component', name: 'Home' }],
  metrics: [], hmr: [], serverPayloads: []
};
const context = {
  chrome: { devtools: { inspectedWindow: { eval: (expression, callback) => {
    assert.match(expression, /Symbol\.for\('vx\.devtools\.bridge'\)/u);
    callback(snapshot, undefined);
  } } } },
  document: {
    querySelector: (selector) => elements.get(selector),
    createElement: () => new Element()
  },
  clearTimeout: () => {},
  setTimeout: () => 1,
  Promise,
  JSON,
  Array
};
vm.runInNewContext(readFileSync(resolve(root, 'panel.js'), 'utf8'), context, { filename: 'panel.js' });
await new Promise((resolvePromise) => setImmediate(resolvePromise));
assert.equal(elements.get('#status').textContent, 'Connected · 4 events');
assert.equal(elements.get('#summary').textContent, '1 component record');
assert.match(elements.get('#output').textContent, /component:1/u);
assert.equal(elements.get('#categories').children.length, 15, 'Every DevTools category must be navigable.');

console.log('VX Browser DevTools extension verified behaviorally.');
