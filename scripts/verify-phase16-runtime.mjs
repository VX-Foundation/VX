import assert from 'node:assert/strict';
globalThis.HTMLInputElement ??= class HTMLInputElement {};

import {
  accessibleName,
  announce,
  auditAccessibility,
  createFocusTrap,
  createRovingTabIndex
} from '../packages/runtime/dist/index.js';

const labelled = element({ 'aria-label': 'Save changes' }, 'ignored');
assert.equal(accessibleName(labelled), 'Save changes');

const unnamedButton = element({}, '');
const missingAlt = element({}, '');
const positiveTabIndex = element({ tabindex: '3' }, 'Focusable');
const nonModalDialog = element({ role: 'dialog' }, 'Dialog');
const root = {
  querySelectorAll(selector) {
    if (selector === 'img') return [missingAlt];
    if (selector.includes('button')) return [unnamedButton];
    if (selector === '[tabindex]') return [positiveTabIndex];
    if (selector.includes('[role="dialog"]')) return [nonModalDialog];
    return [];
  }
};
const issues = auditAccessibility(root);
assert.deepEqual(new Set(issues.map((issue) => issue.code)), new Set(['VX_A11Y_IMAGE_ALT', 'VX_A11Y_NAME', 'VX_A11Y_TAB_ORDER', 'VX_A11Y_DIALOG_MODAL']));

const document = createDocument();
const first = focusableElement(document, 'first');
const second = focusableElement(document, 'second');
const container = focusableElement(document, 'container', [first, second]);
const trap = createFocusTrap(container, { initialFocus: first, returnFocus: second });
trap.activate();
assert.equal(document.activeElement, first);
trap.deactivate();
assert.equal(document.activeElement, second);

const cleanup = createRovingTabIndex(container, '[data-vx-roving]');
assert.equal(first.tabIndex, 0);
assert.equal(second.tabIndex, -1);
first.focus();
container.dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
assert.equal(document.activeElement, second);
cleanup();

announce('Build complete', { document, politeness: 'assertive' });
await Promise.resolve();
assert.equal(document.getElementById('vx-announcer-assertive')?.textContent, 'Build complete');
console.log('Phase 16 runtime verification passed (names, audit, focus trap, roving tabindex, and live announcements).');

function element(attributes, textContent) {
  return {
    ownerDocument: { getElementById: () => null, querySelector: () => null },
    textContent,
    getAttribute(name) { return attributes[name] ?? null; },
    hasAttribute(name) { return Object.hasOwn(attributes, name); }
  };
}

function createDocument() {
  const byId = new Map();
  const document = {
    activeElement: null,
    body: { appendChild(node) { byId.set(node.id, node); } },
    getElementById(id) { return byId.get(id) ?? null; },
    querySelector() { return null; },
    createElement() {
      const attributes = new Map();
      return {
        id: '', textContent: '', style: {}, ownerDocument: document,
        setAttribute(name, value) { attributes.set(name, value); },
        getAttribute(name) { return attributes.get(name) ?? null; }
      };
    }
  };
  return document;
}

function focusableElement(document, id, children = []) {
  const listeners = new Map();
  return {
    id,
    ownerDocument: document,
    tabIndex: 0,
    focus() { document.activeElement = this; },
    hasAttribute() { return false; },
    getAttribute() { return null; },
    querySelectorAll() { return children; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, event) { listeners.get(type)?.(event); }
  };
}
