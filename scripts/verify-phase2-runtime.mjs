import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';

async function main() {
  installFakeDom();
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const source = `#script
    state compact: Bool = false
    action toggle() { compact = !compact }
  #end script
  #view
    View @column(gap: compact ? sm : lg) @page {
      Title("Dashboard") @title
      Button(compact ? "Expand" : "Compact") @primary(width: fill) {
        click => toggle()
      }
    }
    @page {
      inset: compact ? md : xl
      when viewport(max: md) { inset: md }
    }
  #end view`;

  const parsed = parse(source, 'phase2-runtime.vx');
  assert.deepEqual(parsed.diagnostics, []);
  const analysis = analyze(parsed.ast);
  assert.deepEqual(analysis.diagnostics, []);
  const output = lower(parsed.ast, analysis.graph, analysis.visual);

  const directory = await mkdtemp(join(tmpdir(), 'vx-phase2-'));
  try {
    const runtimeUrl = pathToFileURL(join(root, 'packages/runtime/dist/client.js')).href;
    const modulePath = join(directory, 'visual.mjs');
    await writeFile(modulePath, output.clientCode.replace("'@vx/runtime/client'", JSON.stringify(runtimeUrl)), 'utf8');
    const { default: mount } = await import(`${pathToFileURL(modulePath).href}?run=${Date.now()}`);

    const mountRoot = new FakeElement('main');
    const unmount = mount(mountRoot);
    const page = mountRoot.childNodes[0];
    assert(page instanceof FakeElement);
    assert.equal(page.dataset.vxLayout, 'column');
    assert.equal(page.dataset.vxRole, 'page');
    assert.match(page.getAttribute('class') ?? '', /^vx-/);
    assert.equal(page.style.getPropertyValue('gap'), '1.5rem');
    assert.equal(page.style.getPropertyValue('padding'), '2rem');

    const heading = page.childNodes[0];
    const button = page.childNodes[1];
    assert(heading instanceof FakeElement && heading.tagName === 'H1');
    assert.equal(heading.textContent, 'Dashboard');
    assert(button instanceof FakeElement && button.tagName === 'BUTTON');
    assert.equal(button.textContent, 'Compact');
    assert.equal(document.head.childNodes.length, 1);
    assert.match(document.head.childNodes[0].textContent, /prefers-reduced-motion|VX Visual IR|@media/);

    button.dispatch('click');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(page.style.getPropertyValue('gap'), '0.5rem');
    assert.equal(page.style.getPropertyValue('padding'), '1rem');
    assert.equal(button.textContent, 'Expand');

    unmount();
    assert.equal(mountRoot.childNodes.length, 0);
    assert.equal(document.head.childNodes.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log('VX Phase 2 runtime verification passed (scoped CSS, semantics, reactive visual bindings, cleanup).');
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
  get textContent() { return this.childNodes.length ? this.childNodes.map((node) => node.textContent).join('') : this._text; }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ''); }
}
class FakeText extends FakeNode { constructor(value) { super(); this._text = value; } }
class FakeComment extends FakeNode {}
class FakeDocumentFragment extends FakeNode {}
class FakeStyle {
  values = new Map();
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) ?? ''; }
  removeProperty(name) { const old = this.getPropertyValue(name); this.values.delete(name); return old; }
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
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) { const list = this.listeners.get(name) ?? []; list.push(handler); this.listeners.set(name, list); }
  removeEventListener(name, handler) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== handler)); }
  dispatch(name) { for (const handler of this.listeners.get(name) ?? []) handler({ currentTarget: this }); }
}
class FakeInputElement extends FakeElement {}
class FakeTextAreaElement extends FakeElement {}
class FakeSelectElement extends FakeElement {}
class FakeMediaElement extends FakeElement {}
class FakeDocument {
  constructor() { this.head = new FakeElement('head'); this.documentElement = new FakeElement('html'); }
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
  globalThis.HTMLStyleElement = FakeElement;
  globalThis.KeyboardEvent = class {};
  globalThis.DocumentFragment = FakeDocumentFragment;
  globalThis.Comment = FakeComment;
  globalThis.document = new FakeDocument();
}


await main();
