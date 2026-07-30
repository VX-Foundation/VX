/** Namespace-aware DOM target primitives for HTML, SVG, MathML, Shadow DOM, and custom elements. */

import { isURLAttribute, sanitizeURLAttribute, secureExternalRelation } from './security/url.js';

export type DOMNamespace = 'html' | 'svg' | 'mathml' | string;

export interface CreateDOMElementOptions {
  namespace?: DOMNamespace;
  parent?: Node | null;
  document?: Document;
  is?: string;
}

export interface DOMAttributeOptions {
  namespace?: string;
  tagName?: string;
}

export interface DOMEventOptions extends AddEventListenerOptions {
  signal?: AbortSignal;
}

export interface ShadowRootOptions {
  mode?: ShadowRootMode;
  delegatesFocus?: boolean;
  slotAssignment?: SlotAssignmentMode;
  serializable?: boolean;
  clonable?: boolean;
}

export const DOM_NAMESPACES = Object.freeze({
  html: 'http://www.w3.org/1999/xhtml',
  svg: 'http://www.w3.org/2000/svg',
  mathml: 'http://www.w3.org/1998/Math/MathML',
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xmlns: 'http://www.w3.org/2000/xmlns/'
});

export function createDOMElement(tagName: string, options: CreateDOMElementOptions = {}): Element {
  assertTagName(tagName);
  const documentTarget = options.document ?? options.parent?.ownerDocument ?? document;
  const namespace = resolveDOMNamespace(options.namespace ?? inferRootNamespace(tagName, options.parent), options.parent);
  if (namespace === DOM_NAMESPACES.html) {
    return options.is
      ? documentTarget.createElement(tagName, { is: options.is })
      : documentTarget.createElement(tagName);
  }
  return documentTarget.createElementNS(namespace, tagName);
}

export function resolveDOMNamespace(namespace?: DOMNamespace, parent?: Node | null): string {
  if (namespace === 'html') return DOM_NAMESPACES.html;
  if (namespace === 'svg') return DOM_NAMESPACES.svg;
  if (namespace === 'mathml') return DOM_NAMESPACES.mathml;
  if (namespace) return namespace;
  if (parent instanceof Element) {
    if (parent.namespaceURI === DOM_NAMESPACES.svg && parent.localName !== 'foreignObject') return DOM_NAMESPACES.svg;
    if (parent.namespaceURI === DOM_NAMESPACES.mathml && parent.localName !== 'annotation-xml') return DOM_NAMESPACES.mathml;
  }
  return DOM_NAMESPACES.html;
}

export function setDOMAttribute(element: Element, name: string, value: unknown, options: DOMAttributeOptions = {}): void {
  assertAttributeName(name);
  if (value === undefined || value === null || value === false) {
    if (options.namespace) element.removeAttributeNS(options.namespace, localAttributeName(name));
    else element.removeAttribute(name);
    return;
  }
  let normalized: unknown = value;
  if (isURLAttribute(name)) {
    normalized = sanitizeURLAttribute(value, { attribute: name, tagName: options.tagName ?? element.localName });
    if (normalized === undefined) {
      element.removeAttribute(name);
      element.setAttribute('data-vx-blocked-url', name);
      return;
    }
    element.removeAttribute('data-vx-blocked-url');
  }
  if (name === 'target' && normalized === '_blank') {
    setDOMAttribute(element, 'rel', secureExternalRelation(element.getAttribute('rel')));
  }
  const serialized = normalized === true ? '' : String(normalized);
  if (options.namespace) element.setAttributeNS(options.namespace, name, serialized);
  else element.setAttribute(name, serialized);
}

export function setDOMAttributeNS(element: Element, qualifiedName: string, value: unknown): void {
  const prefix = qualifiedName.includes(':') ? qualifiedName.slice(0, qualifiedName.indexOf(':')) : '';
  const namespace = prefix === 'xlink' ? DOM_NAMESPACES.xlink
    : prefix === 'xml' ? DOM_NAMESPACES.xml
      : prefix === 'xmlns' || qualifiedName === 'xmlns' ? DOM_NAMESPACES.xmlns
        : undefined;
  setDOMAttribute(element, qualifiedName, value, namespace ? { namespace } : {});
}

export function setDOMProperty(element: Element, property: string, value: unknown): void {
  assertPropertyName(property);
  const target = element as unknown as Record<string, unknown>;
  if (!Object.is(target[property], value)) target[property] = value;
}

export function setDOMStyle(element: Element, property: string, value: unknown, priority = ''): void {
  const style = styleDeclaration(element);
  const normalized = toCssProperty(property);
  if (value === undefined || value === null || value === false || value === '') {
    style.removeProperty(normalized);
    return;
  }
  style.setProperty(normalized, String(value), priority);
}

export function setDOMStyles(element: Element, values: Readonly<Record<string, unknown>>): () => void {
  const style = styleDeclaration(element);
  const previous = new Map<string, { value: string; priority: string }>();
  for (const [property, value] of Object.entries(values)) {
    const normalized = toCssProperty(property);
    previous.set(normalized, { value: style.getPropertyValue(normalized), priority: style.getPropertyPriority(normalized) });
    setDOMStyle(element, normalized, value);
  }
  return () => {
    for (const [property, state] of previous) {
      if (state.value) style.setProperty(property, state.value, state.priority);
      else style.removeProperty(property);
    }
  };
}

export function listenDOMEvent(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options: DOMEventOptions = {}
): () => void {
  if (!type || /^on/i.test(type)) throw new TypeError(`Invalid VX DOM event type '${type}'.`);
  if (options.signal?.aborted) return () => undefined;
  const nativeOptions: AddEventListenerOptions = {
    ...(options.capture !== undefined ? { capture: options.capture } : {}),
    ...(options.once !== undefined ? { once: options.once } : {}),
    ...(options.passive !== undefined ? { passive: options.passive } : {})
  };
  target.addEventListener(type, listener, nativeOptions);
  let active = true;
  const cleanup = (): void => {
    if (!active) return;
    active = false;
    target.removeEventListener(type, listener, nativeOptions);
    options.signal?.removeEventListener('abort', cleanup);
  };
  options.signal?.addEventListener('abort', cleanup, { once: true });
  return cleanup;
}

export function attachShadowRoot(host: HTMLElement, options: ShadowRootOptions = {}): ShadowRoot {
  if (host.shadowRoot) {
    if (host.shadowRoot.mode !== (options.mode ?? 'open')) throw new Error('VX cannot replace an existing ShadowRoot with a different mode.');
    return host.shadowRoot;
  }
  const nativeOptions: ShadowRootInit & Record<string, unknown> = {
    mode: options.mode ?? 'open',
    ...(options.delegatesFocus !== undefined ? { delegatesFocus: options.delegatesFocus } : {}),
    ...(options.slotAssignment ? { slotAssignment: options.slotAssignment } : {}),
    ...(options.serializable !== undefined ? { serializable: options.serializable } : {}),
    ...(options.clonable !== undefined ? { clonable: options.clonable } : {})
  };
  return host.attachShadow(nativeOptions as ShadowRootInit);
}

export function defineCustomElement(
  name: string,
  constructor: CustomElementConstructor,
  options?: ElementDefinitionOptions,
  registry: CustomElementRegistry = customElements
): void {
  assertCustomElementName(name);
  const existing = registry.get(name);
  if (existing) {
    if (existing !== constructor) throw new Error(`Custom element '${name}' is already defined with a different constructor.`);
    return;
  }
  registry.define(name, constructor, options);
}

export function upgradeCustomElements(root: Node, registry: CustomElementRegistry = customElements): void {
  registry.upgrade(root);
}


function inferRootNamespace(tagName: string, parent: Node | null | undefined): DOMNamespace | undefined {
  if (parent) return undefined;
  const normalized = tagName.toLowerCase();
  if (normalized === 'svg') return 'svg';
  if (normalized === 'math') return 'mathml';
  return undefined;
}

function styleDeclaration(element: Element): CSSStyleDeclaration {
  const candidate = element as Element & { style?: CSSStyleDeclaration };
  if (!candidate.style) throw new TypeError(`Element '${element.localName}' does not expose an inline style declaration.`);
  return candidate.style;
}

function localAttributeName(name: string): string {
  const separator = name.indexOf(':');
  return separator >= 0 ? name.slice(separator + 1) : name;
}

function toCssProperty(property: string): string {
  return property.startsWith('--') ? property : property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function assertTagName(value: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(value)) throw new TypeError(`Invalid VX DOM tag name '${value}'.`);
}

function assertAttributeName(value: string): void {
  if (!/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(value) || /^on/i.test(value)) throw new TypeError(`Invalid VX DOM attribute '${value}'.`);
}

function assertPropertyName(value: string): void {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) {
    throw new TypeError(`Invalid VX DOM property '${value}'.`);
  }
}

function assertCustomElementName(value: string): void {
  if (!/^[a-z][.0-9_a-z-]*-[.0-9_a-z-]*$/.test(value) || value.startsWith('xml')) {
    throw new TypeError(`Invalid custom element name '${value}'.`);
  }
}
