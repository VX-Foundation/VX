import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = `#script
  state count: Int = 0
  derive doubled: Int = count * 2
  action increment() { count++ }
  #end script
  #view
  Text("Value: " + count)
  Text("Double: " + doubled)
  Button("Increment") { click => increment() }
  #end view`;

  const parsed = parse(source, 'counter.vx');
  assert.deepEqual(parsed.diagnostics, []);
  const analysis = analyze(parsed.ast);
  assert.deepEqual(analysis.diagnostics, []);
  const lowered = lower(parsed.ast, analysis.graph);
  assert.match(lowered.clientCode, /count\.value\+\+/);
  assert.doesNotMatch(lowered.clientCode, /ctx:\s*any|ctxVar/);

  installFakeDom();
  const directory = await mkdtemp(join(tmpdir(), 'vx-phase1-'));
  try {
    const runtimeUrl = pathToFileURL(join(root, 'packages/runtime/dist/client.js')).href;
    const modulePath = join(directory, 'counter.mjs');
    await writeFile(
      modulePath,
      lowered.clientCode.replace("'@vx/runtime/client'", JSON.stringify(runtimeUrl)),
      'utf8'
    );

    const { default: mount } = await import(`${pathToFileURL(modulePath).href}?run=${Date.now()}`);
    const mountRoot = new FakeElement('main');
    const unmount = mount(mountRoot);
    const spans = () => mountRoot.childNodes
      .filter((node) => node instanceof FakeElement && node.tagName === 'SPAN')
      .map((node) => node.textContent);
    const button = mountRoot.childNodes.find(
      (node) => node instanceof FakeElement && node.tagName === 'BUTTON'
    );

    assert(button instanceof FakeElement);
    assert.deepEqual(spans(), ['Value: 0', 'Double: 0']);
    button.dispatch('click');
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(spans(), ['Value: 1', 'Double: 2']);

    unmount();
    assert.equal(mountRoot.childNodes.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log('VX Phase 1 runtime verification passed (counter, derived value, event, cleanup).');

}

class FakeNode {
  parentNode = null;
  childNodes = [];
  _text = '';

  appendChild(node) {
    if (node instanceof FakeDocumentFragment) {
      for (const child of [...node.childNodes]) this.appendChild(child);
      node.childNodes = [];
      return node;
    }
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node, reference) {
    if (node instanceof FakeDocumentFragment) {
      for (const child of [...node.childNodes]) this.insertBefore(child, reference);
      node.childNodes = [];
      return node;
    }
    if (node.parentNode) node.parentNode.removeChild(node);
    const found = reference == null ? this.childNodes.length : this.childNodes.indexOf(reference);
    const index = found < 0 ? this.childNodes.length : found;
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this._text = '';
    for (const node of nodes) this.appendChild(node);
  }

  get textContent() {
    return this.childNodes.length > 0
      ? this.childNodes.map((child) => child.textContent).join('')
      : this._text;
  }

  set textContent(value) {
    this.replaceChildren();
    this._text = String(value ?? '');
  }
}

class FakeText extends FakeNode {
  constructor(value) {
    super();
    this._text = value;
  }
}
class FakeComment extends FakeNode {}
class FakeDocumentFragment extends FakeNode {}
class FakeStyle {
  values = new Map();
  setProperty(name, value) { this.values.set(name, value); }
}
class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(handler);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((value) => value !== handler));
  }
  dispatch(name) {
    for (const handler of this.listeners.get(name) ?? []) handler({ currentTarget: this });
  }
}
class FakeInputElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}
class FakeSelectElement extends FakeElement {}
class FakeMediaElement extends FakeElement {}
class FakeDocument {
  createDocumentFragment() { return new FakeDocumentFragment(); }
  createElement(tag) {
    if (tag === 'input') return new FakeInputElement(tag);
    if (tag === 'textarea') return new FakeTextAreaElement(tag);
    if (tag === 'select') return new FakeSelectElement(tag);
    if (tag === 'audio' || tag === 'video') return new FakeMediaElement(tag);
    return new FakeElement(tag);
  }
  createTextNode(value) { return new FakeText(value); }
  createComment() { return new FakeComment(); }
}

function installFakeDom() {
  globalThis.Node = FakeNode;
  globalThis.Element = FakeElement;
  globalThis.HTMLElement = FakeElement;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTextAreaElement = FakeTextAreaElement;
  globalThis.HTMLSelectElement = FakeSelectElement;
  globalThis.HTMLMediaElement = FakeMediaElement;
  globalThis.KeyboardEvent = class {};
  globalThis.DocumentFragment = FakeDocumentFragment;
  globalThis.Comment = FakeComment;
  globalThis.document = new FakeDocument();
}

await main();
