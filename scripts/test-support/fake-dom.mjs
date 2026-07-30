export class FakeNode {
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

  get firstChild() { return this.childNodes[0] ?? null; }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index < 0 ? null : (this.parentNode.childNodes[index + 1] ?? null);
  }

  contains(node) {
    if (node === this) return true;
    return this.childNodes.some((child) => child.contains(node));
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  querySelectorAll(selector) {
    const selectors = selector.split(',').map((value) => value.trim()).filter(Boolean);
    const matches = [];
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement && selectors.some((value) => matchesSelector(child, value))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
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

export class FakeText extends FakeNode {
  constructor(value) {
    super();
    this._text = value;
  }
}

export class FakeComment extends FakeNode {}
export class FakeDocumentFragment extends FakeNode {}

export class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return (this.element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean); }
  add(...names) { this.element.setAttribute('class', [...new Set([...this.values(), ...names])].join(' ')); }
  remove(...names) {
    const removed = new Set(names);
    const next = this.values().filter((name) => !removed.has(name));
    if (next.length) this.element.setAttribute('class', next.join(' '));
    else this.element.removeAttribute('class');
  }
  contains(name) { return this.values().includes(name); }
}

export class FakeStyle {
  values = new Map();
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) ?? ''; }
  removeProperty(name) {
    const previous = this.getPropertyValue(name);
    this.values.delete(name);
    return previous;
  }
}

export class FakeElement extends FakeNode {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.classList = new FakeClassList(this);
    this.listeners = new Map();
  }
  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name.startsWith('data-')) this.dataset[toDatasetKey(name)] = normalized;
  }
  getAttribute(name) {
    if (name.startsWith('data-')) return this.dataset[toDatasetKey(name)] ?? null;
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[toDatasetKey(name)];
  }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  focus() { globalThis.document.activeElement = this; }
  remove() { this.parentNode?.removeChild(this); }
  addEventListener(name, handler) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(handler);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((value) => value !== handler));
  }
  dispatch(name, detail = undefined) {
    for (const handler of this.listeners.get(name) ?? []) {
      handler({ currentTarget: this, target: this, detail, type: name });
    }
  }
}

export class FakeInputElement extends FakeElement {
  selectionStart = null;
  selectionEnd = null;
  selectionDirection = null;
  value = '';
  setSelectionRange(start, end, direction = 'none') {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
}
export class FakeTextAreaElement extends FakeInputElement {}
export class FakeSelectElement extends FakeElement {}
export class FakeMediaElement extends FakeElement {}

export class FakeDocument {
  constructor() {
    this.head = new FakeElement('head');
    this.body = new FakeElement('body');
    this.documentElement = new FakeElement('html');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.visibilityState = 'visible';
    this.activeElement = null;
    this.listeners = new Map();
  }
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
  querySelector(selector) {
    if (selector === 'head') return this.head;
    if (selector === 'body') return this.body;
    return this.documentElement.querySelector(selector);
  }
  addEventListener(name, handler) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(handler);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, handler) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((value) => value !== handler));
  }
}

function toDatasetKey(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function matchesSelector(element, selector) {
  if (selector === '*') return true;
  const attribute = /^\[([^\]]+)\]$/.exec(selector)?.[1];
  if (!attribute) return false;
  return element.hasAttribute(attribute);
}

export function installFakeDom({ installWindow = false } = {}) {
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
  if (installWindow) {
    const listeners = new Map();
    globalThis.window = {
      addEventListener(name, handler) {
        const values = listeners.get(name) ?? [];
        values.push(handler);
        listeners.set(name, values);
      },
      removeEventListener(name, handler) {
        listeners.set(name, (listeners.get(name) ?? []).filter((value) => value !== handler));
      }
    };
  }
}
