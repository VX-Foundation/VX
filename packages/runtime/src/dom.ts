import type { Cleanup } from './structural.js';
import { isURLAttribute, sanitizeURLAttribute, secureExternalRelation } from './security/url.js';
import { listenDOMEvent, setDOMAttribute, setDOMProperty, setDOMStyle, setDOMStyles } from './dom-target.js';
export { conditionalMount, collectionMount, listMount, matchViewPattern, matchesPattern, selectPatternBranch, structuralMount } from './structural.js';
export type { Cleanup, CollectionFallbackRenderers, CollectionInput, CollectionResource, MountBlock, MountOutput, StructuralKey, StructuralScope, StructuralSelection, StructuralTransition, StructuralTransitionInput, ViewPatternDescriptor } from './structural.js';


const unitlessStyleProperties = new Set([
  'opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flexGrow', 'flexShrink', 'order'
]);

export function setText(node: Node, value: unknown): void {
  const text = value == null ? '' : String(value);
  if (node.textContent !== text) node.textContent = text;
}

export function setAttribute(node: Element, attribute: string, value: unknown): void {
  setDOMAttribute(node, attribute, value);
}

export function setProperty(node: Element, property: string, value: unknown): void {
  setDOMProperty(node, property, value);
}

export function setStyle(node: Element, property: string, value: unknown, priority = ''): void {
  setDOMStyle(node, property, value, priority);
}

export function setStyles(node: Element, values: Readonly<Record<string, unknown>>): Cleanup {
  return setDOMStyles(node, values);
}

export function markWidget(node: HTMLElement, widgetName: string, scope?: string): void {
  node.dataset['vxWidget'] = widgetName;
  if (scope) node.dataset['vxScope'] = scope;
  applyWidgetDefaults(node, widgetName);
}

/** Links a concrete DOM node to its stable VX visual-source map entry. */
export function markViewSource(node: Node, sourceId: string): void {
  const element = node instanceof HTMLElement ? node : findFirstElement(node);
  if (element) element.dataset['vxSource'] = sourceId;
}

function findFirstElement(node: Node): HTMLElement | undefined {
  for (const child of Array.from(node.childNodes)) {
    if (child instanceof HTMLElement) return child;
    const nested = findFirstElement(child);
    if (nested) return nested;
  }
  return undefined;
}

/** Applies semantic widget properties to native DOM and CSS. */
export function setWidgetProperty(
  node: HTMLElement,
  widgetName: string,
  property: string,
  value: unknown
): void {
  if (property === 'text' || property === 'label') {
    setText(node, value);
    return;
  }

  if (property === 'decorative' && (widgetName === 'Image' || widgetName === 'Icon')) {
    const decorative = Boolean(value);
    setAttribute(node, 'aria-hidden', decorative);
    if (widgetName === 'Image' && decorative) setAttribute(node, 'alt', '');
    if (decorative) node.setAttribute('role', 'presentation');
    else if (node.getAttribute('role') === 'presentation') node.removeAttribute('role');
    return;
  }

  if (property === 'trusted' && widgetName === 'IFrame') {
    if (value === true) node.removeAttribute('sandbox');
    else if (!node.hasAttribute('sandbox')) node.setAttribute('sandbox', '');
    return;
  }

  if (property === 'ariaLabel' && widgetName === 'Icon' && value) node.removeAttribute('aria-hidden');

  const normalizedAttribute = normalizeAttribute(property);
  if (isURLAttribute(normalizedAttribute)) {
    const safe = sanitizeURLAttribute(value, { attribute: normalizedAttribute, tagName: node.tagName.toLowerCase() });
    if (safe === undefined) {
      node.removeAttribute(normalizedAttribute);
      node.dataset['vxBlockedUrl'] = normalizedAttribute;
    } else {
      setAttribute(node, normalizedAttribute, safe);
      delete node.dataset['vxBlockedUrl'];
    }
    return;
  }

  if (property === 'target') {
    setAttribute(node, 'target', value);
    if (value === '_blank') setAttribute(node, 'rel', secureExternalRelation(node.getAttribute('rel')));
    return;
  }

  if (property === 'rel') {
    const relation = node.getAttribute('target') === '_blank' ? secureExternalRelation(value) : value;
    setAttribute(node, 'rel', relation);
    return;
  }

  if (property === 'value' && 'value' in node) {
    setProperty(node, 'value', value == null ? '' : String(value));
    return;
  }

  if (['checked', 'selected', 'disabled', 'required', 'readOnly', 'muted', 'controls', 'loop', 'autoplay'].includes(property)) {
    setProperty(node, normalizeDomProperty(property), Boolean(value));
    return;
  }

  if (property === 'loading') {
    setAttribute(node, 'aria-busy', Boolean(value));
    if (value) node.dataset['vxState'] = `${node.dataset['vxState'] ?? ''} loading`.trim();
    else node.dataset['vxState'] = (node.dataset['vxState'] ?? '').split(/\s+/).filter((state) => state && state !== 'loading').join(' ');
    return;
  }

  if (property === 'selected' || property === 'expanded' || property === 'invalid') {
    setAttribute(node, `aria-${property}`, Boolean(value));
  }

  if (property === 'layout') {
    node.style.setProperty('display', 'flex');
    node.style.setProperty('flex-direction', value === 'row' ? 'row' : 'column');
    return;
  }

  const styleProperty = resolveStyleProperty(widgetName, property, value);
  if (styleProperty) {
    const [name, resolvedValue] = styleProperty;
    node.style.setProperty(toCssProperty(name), resolvedValue);
    return;
  }

  const attribute = normalizeAttribute(property);
  setAttribute(node, attribute, value);
}

export function on(
  node: EventTarget,
  event: string,
  handler: (event: Event) => void,
  options: AddEventListenerOptions & { signal?: AbortSignal } = {}
): Cleanup {
  return listenDOMEvent(node, event, handler, options);
}

/**
 * Normalizes semantic VX widget events. `$event` receives the useful value for
 * value controls, and the native Event object for ordinary DOM events.
 */
export function onWidgetEvent(
  node: HTMLElement,
  widgetName: string,
  eventName: string,
  handler: (eventValue: unknown, nativeEvent: Event) => void
): Cleanup {
  const nativeName = normalizeEventName(widgetName, eventName);
  return on(node, nativeName, (event) => {
    let value: unknown = event;
    const target = event.currentTarget;

    if (eventName === 'change' && target instanceof HTMLInputElement) {
      value = target.type === 'checkbox' || target.type === 'radio' ? target.checked : target.value;
    } else if (eventName === 'change' && (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      value = target.value;
    } else if (eventName === 'keyDown' || eventName === 'keyUp') {
      value = event instanceof KeyboardEvent ? event.key : event;
    } else if (eventName === 'timeUpdate' && target instanceof HTMLMediaElement) {
      value = target.currentTime;
    }

    handler(value, event);
  });
}

const installedStyles = new Map<string, { element: HTMLStyleElement; references: number }>();

export function installStyles(scope: string, css: string): Cleanup {
  if (!css || typeof document === 'undefined' || !document.head) return () => {};
  const existing = installedStyles.get(scope);
  if (existing) {
    existing.references += 1;
    return () => releaseStyle(scope);
  }

  const element = document.createElement('style');
  element.dataset['vxStyle'] = scope;
  element.textContent = css;
  document.head.appendChild(element);
  installedStyles.set(scope, { element, references: 1 });
  return () => releaseStyle(scope);
}

function releaseStyle(scope: string): void {
  const entry = installedStyles.get(scope);
  if (!entry) return;
  entry.references -= 1;
  if (entry.references > 0) return;
  if (typeof entry.element.remove === 'function') entry.element.remove();
  else entry.element.parentNode?.removeChild(entry.element);
  installedStyles.delete(scope);
}

function normalizeEventName(widgetName: string, eventName: string): string {
  if (eventName === 'change' && ['Input', 'TextArea', 'Slider'].includes(widgetName)) return 'input';
  const aliases: Record<string, string> = {
    mouseEnter: 'mouseenter',
    mouseLeave: 'mouseleave',
    keyDown: 'keydown',
    keyUp: 'keyup',
    timeUpdate: 'timeupdate',
    dragStart: 'pointerdown',
    dragEnd: 'pointerup',
    end: 'ended'
  };
  return aliases[eventName] ?? eventName.toLowerCase();
}

function normalizeDomProperty(property: string): string {
  if (property === 'readonly') return 'readOnly';
  if (property === 'autoPlay') return 'autoplay';
  return property;
}

function normalizeAttribute(property: string): string {
  const aliases: Record<string, string> = {
    className: 'class',
    htmlFor: 'for',
    autoComplete: 'autocomplete',
    autoFocus: 'autofocus',
    crossOrigin: 'crossorigin',
    referrerPolicy: 'referrerpolicy',
    allowFullScreen: 'allowfullscreen',
    maxLength: 'maxlength',
    minLength: 'minlength',
    dataTestId: 'data-testid'
  };
  return aliases[property] ?? property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}


function applyWidgetDefaults(node: HTMLElement, widgetName: string): void {
  if (widgetName === 'Button' && 'type' in node && !node.hasAttribute('type')) (node as HTMLButtonElement).type = 'button';
  if (widgetName === 'Image') {
    if (!node.hasAttribute('loading')) node.setAttribute('loading', 'lazy');
    if (!node.hasAttribute('decoding')) node.setAttribute('decoding', 'async');
  }
  if (widgetName === 'IFrame') {
    if (!node.hasAttribute('loading')) node.setAttribute('loading', 'lazy');
    if (!node.hasAttribute('referrerpolicy')) node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    if (!node.hasAttribute('sandbox')) node.setAttribute('sandbox', '');
  }
  if (widgetName === 'Slider' && 'type' in node) (node as HTMLInputElement).type = 'range';
  if (widgetName === 'Switch' && 'type' in node) {
    (node as HTMLInputElement).type = 'checkbox';
    node.setAttribute('role', 'switch');
  }
  if (widgetName === 'List' && !node.hasAttribute('role')) node.setAttribute('role', 'list');
  if (widgetName === 'Icon' && !node.hasAttribute('aria-label')) node.setAttribute('aria-hidden', 'true');
}

function resolveStyleProperty(widgetName: string, property: string, value: unknown): [string, string] | null {
  const aliases: Record<string, string> = {
    background: 'background',
    cornerRadius: 'borderRadius',
    shadow: 'boxShadow',
    align: 'alignItems',
    justify: 'justifyContent',
    spacing: 'gap',
    size: widgetName === 'Text' ? 'fontSize' : 'fontSize',
    weight: 'fontWeight',
    color: 'color',
    lineHeight: 'lineHeight',
    letterSpacing: 'letterSpacing',
    textDecoration: 'textDecoration',
    textTransform: 'textTransform',
    fontFamily: 'fontFamily',
    objectFit: 'objectFit',
    objectPosition: 'objectPosition'
  };

  if (property === 'wrap') return ['flexWrap', value ? 'wrap' : 'nowrap'];

  const directStyle = new Set([
    'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
    'padding', 'margin', 'border', 'opacity', 'overflow', 'position', 'zIndex',
    'cursor', 'fontSize', 'fontWeight', 'textAlign', 'resize'
  ]);
  const styleName = aliases[property] ?? (directStyle.has(property) ? property : undefined);
  if (!styleName) return null;

  if (value == null || value === false) return [styleName, ''];
  const normalized = typeof value === 'number' && !unitlessStyleProperties.has(String(styleName)) ? `${value}px` : String(value);
  return [styleName, normalized];
}

function toCssProperty(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
