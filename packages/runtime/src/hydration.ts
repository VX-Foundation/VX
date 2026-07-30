import { createDOMElement, resolveDOMNamespace, type DOMNamespace } from './dom-target.js';
import { deserializeServerValue } from './server-platform/serialization.js';

export type HydrationRecoveryMode = 'patch' | 'replace' | 'throw';
export type HydrationDiagnosticCode =
  | 'VX_HYDRATION_MISSING_ELEMENT'
  | 'VX_HYDRATION_TAG_MISMATCH'
  | 'VX_HYDRATION_NAMESPACE_MISMATCH'
  | 'VX_HYDRATION_MISSING_COMMENT'
  | 'VX_HYDRATION_MISSING_TEXT'
  | 'VX_HYDRATION_TEXT_MISMATCH'
  | 'VX_HYDRATION_UNCLAIMED_NODE'
  | 'VX_HYDRATION_EXTERNAL_MUTATION'
  | 'VX_HYDRATION_BOUNDARY_RECOVERED';

export interface HydrationDiagnostic {
  readonly code: HydrationDiagnosticCode;
  readonly message: string;
  readonly sourceId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly path?: string;
  readonly recovered: boolean;
}

export interface HydrationRegistryOptions {
  recovery?: HydrationRecoveryMode;
  onDiagnostic?: (diagnostic: HydrationDiagnostic) => void;
  tolerateExternalMutations?: boolean;
}

export interface HydrationRegistry {
  readonly root: Node;
  readonly diagnostics: readonly HydrationDiagnostic[];
  claimElement(sourceId: string, tagName: string, namespace?: DOMNamespace): Element | undefined;
  claimComment(value: string): Comment | undefined;
  claimText(sourceId: string): Text | undefined;
  report(diagnostic: HydrationDiagnostic): void;
  finalize(): readonly HydrationDiagnostic[];
  dispose(): void;
}

export interface ClientHydrationState {
  routeId: string;
  url: string;
  hydration?: 'full' | 'islands' | 'none';
  queries?: unknown;
  islands?: readonly unknown[];
  forms?: Readonly<Record<string, unknown>>;
  resumable?: readonly unknown[];
}

interface HydrationIndex {
  elements: Map<string, Element[]>;
  comments: Map<string, Comment[]>;
  vxNodes: Set<Node>;
  consumed: Set<Node>;
}

export function createHydrationRegistry(root: Node, options: HydrationRegistryOptions = {}): HydrationRegistry {
  return createHydrationRegistryFromNodes(root, [root], options);
}

export function createRangeHydrationRegistry(
  start: Comment,
  end: Comment,
  options: HydrationRegistryOptions = {}
): HydrationRegistry {
  if (!start.parentNode || start.parentNode !== end.parentNode) throw new TypeError('VX island markers must share a parent node.');
  return createHydrationRegistryFromNodes(start.parentNode, nodesBetween(start, end), options);
}

function createHydrationRegistryFromNodes(
  root: Node,
  roots: readonly Node[],
  options: HydrationRegistryOptions
): HydrationRegistry {
  const index: HydrationIndex = { elements: new Map(), comments: new Map(), vxNodes: new Set(), consumed: new Set() };
  const diagnostics: HydrationDiagnostic[] = [];
  let disposed = false;
  for (const node of roots) collect(node, index);

  const registry: HydrationRegistry = {
    root,
    get diagnostics() { return Object.freeze([...diagnostics]); },
    claimElement(sourceId, tagName, namespace) {
      ensureActive();
      const candidates = index.elements.get(sourceId) ?? [];
      const expectedNamespace = resolveDOMNamespace(namespace);
      const exact = candidates.find((candidate) => !index.consumed.has(candidate)
        && candidate.localName.toLowerCase() === tagName.toLowerCase()
        && (candidate.namespaceURI ?? resolveDOMNamespace()) === expectedNamespace);
      if (exact) {
        index.consumed.add(exact);
        return exact;
      }
      const available = candidates.find((candidate) => !index.consumed.has(candidate));
      if (available) {
        const tagMatches = available.localName.toLowerCase() === tagName.toLowerCase();
        report(createDiagnostic(
          tagMatches ? 'VX_HYDRATION_NAMESPACE_MISMATCH' : 'VX_HYDRATION_TAG_MISMATCH',
          sourceId,
          `${expectedNamespace}:${tagName}`,
          `${available.namespaceURI ?? ''}:${available.localName}`,
          available,
          false
        ));
        if ((options.recovery ?? 'patch') === 'throw') throw hydrationError(diagnostics.at(-1)!);
      } else {
        report(createDiagnostic('VX_HYDRATION_MISSING_ELEMENT', sourceId, tagName, undefined, root, false));
        if ((options.recovery ?? 'patch') === 'throw') throw hydrationError(diagnostics.at(-1)!);
      }
      return undefined;
    },
    claimComment(value) {
      ensureActive();
      const comment = index.comments.get(value)?.find((candidate) => !index.consumed.has(candidate));
      if (!comment) {
        report(createDiagnostic('VX_HYDRATION_MISSING_COMMENT', undefined, value, undefined, root, false));
        if ((options.recovery ?? 'patch') === 'throw') throw hydrationError(diagnostics.at(-1)!);
        return undefined;
      }
      index.consumed.add(comment);
      return comment;
    },
    claimText(sourceId) {
      ensureActive();
      const marker = registry.claimComment(`vx:text:${sourceId}`);
      const text = marker?.nextSibling;
      if (!(text instanceof Text) || index.consumed.has(text)) {
        report(createDiagnostic('VX_HYDRATION_MISSING_TEXT', sourceId, 'Text', describeNode(text), marker ?? root, false));
        if ((options.recovery ?? 'patch') === 'throw') throw hydrationError(diagnostics.at(-1)!);
        return undefined;
      }
      index.consumed.add(text);
      return text;
    },
    report(diagnostic) {
      diagnostics.push(Object.freeze({ ...diagnostic }));
      options.onDiagnostic?.(diagnostic);
    },
    finalize() {
      if (disposed) return Object.freeze([...diagnostics]);
      for (const node of index.vxNodes) {
        if (index.consumed.has(node)) continue;
        if (node instanceof Element && !node.hasAttribute('data-vx-source')) continue;
        registry.report(createDiagnostic('VX_HYDRATION_UNCLAIMED_NODE', undefined, undefined, describeNode(node), node, false));
      }
      return Object.freeze([...diagnostics]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      index.elements.clear();
      index.comments.clear();
      index.vxNodes.clear();
      index.consumed.clear();
    }
  };
  return registry;

  function report(diagnostic: HydrationDiagnostic): void { registry.report(diagnostic); }
  function ensureActive(): void {
    if (disposed) throw new Error('Cannot use a disposed VX hydration registry.');
  }
}

export function claimHydrationElement(
  registry: HydrationRegistry | undefined,
  sourceId: string,
  tagName: string,
  namespace?: DOMNamespace
): Element {
  const claimed = registry?.claimElement(sourceId, tagName, namespace);
  if (claimed) return claimed;
  return namespace ? createDOMElement(tagName, { namespace }) : createDOMElement(tagName);
}

export function claimHydrationComment(registry: HydrationRegistry | undefined, value: string): Comment {
  return registry?.claimComment(value) ?? document.createComment(value);
}

export function claimHydrationText(
  registry: HydrationRegistry | undefined,
  sourceId: string,
  value: string
): Text {
  const text = registry?.claimText(sourceId) ?? document.createTextNode(value);
  if (text.data !== value) {
    registry?.report(createDiagnostic('VX_HYDRATION_TEXT_MISMATCH', sourceId, value, text.data, text, true));
    text.data = value;
  }
  return text;
}

export function recoverHydrationRange(
  start: Comment,
  end: Comment,
  render: () => Node,
  registry?: HydrationRegistry
): void {
  const parent = start.parentNode;
  if (!parent || end.parentNode !== parent) throw new TypeError('VX hydration recovery requires markers with one parent.');
  const snapshot = captureInteractiveState(parent);
  const range = start.ownerDocument.createRange();
  range.setStartAfter(start);
  range.setEndBefore(end);
  range.deleteContents();
  parent.insertBefore(render(), end);
  restoreInteractiveState(parent, snapshot);
  registry?.report(createDiagnostic('VX_HYDRATION_BOUNDARY_RECOVERED', undefined, undefined, undefined, start, true));
}

export function observeExternalDOMMutations(
  root: Node,
  onDiagnostic: (diagnostic: HydrationDiagnostic) => void
): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  let hydrating = true;
  queueMicrotask(() => { hydrating = false; });
  const observer = new MutationObserver((records) => {
    if (hydrating) return;
    for (const record of records) {
      const target = record.target;
      const owned = target instanceof Element
        ? target.closest('[data-vx-source], [data-vx-ssr], [data-vx-island]')
        : target.parentElement?.closest('[data-vx-source], [data-vx-ssr], [data-vx-island]');
      if (!owned) continue;
      onDiagnostic(createDiagnostic('VX_HYDRATION_EXTERNAL_MUTATION', undefined, undefined, record.type, target, false));
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
  return () => observer.disconnect();
}

export function readHydrationState(documentTarget: Document = document): ClientHydrationState | undefined {
  const target = documentTarget as Document & { getElementById?: (id: string) => HTMLElement | null; querySelector?: (selector: string) => Element | null };
  const script = target.getElementById?.('__VX_STATE__') ?? target.querySelector?.('#__VX_STATE__') ?? null;
  if (!script?.textContent) return undefined;
  const value = deserializeServerValue(script.textContent);
  if (!isRecord(value) || typeof value['routeId'] !== 'string' || typeof value['url'] !== 'string') {
    throw new TypeError('Invalid VX hydration state.');
  }
  return value as unknown as ClientHydrationState;
}

export function installStreamingPatches(documentTarget: Document = document): () => void {
  const target = documentTarget as Document & { querySelectorAll?: (selector: string) => NodeListOf<Element> };
  if (typeof target.querySelectorAll !== 'function' || typeof MutationObserver === 'undefined') return () => undefined;
  const apply = (script: Element): void => {
    const source = script.textContent;
    if (!source) { script.remove(); return; }
    const payload = deserializeServerValue(source);
    if (!isRecord(payload) || typeof payload['id'] !== 'string') { script.remove(); return; }
    if (typeof payload['html'] === 'string') replaceBoundary(documentTarget, payload['id'], payload['html']);
    script.remove();
  };
  target.querySelectorAll('script[data-vx-stream]').forEach(apply);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && node.matches('script[data-vx-stream]')) apply(node);
        if (node instanceof Element) node.querySelectorAll('script[data-vx-stream]').forEach(apply);
      }
    }
  });
  observer.observe(documentTarget.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function replaceBoundary(documentTarget: Document, id: string, html: string): void {
  const boundary = findCommentRange(documentTarget, `vx:stream:${id}:start`, `vx:stream:${id}:end`);
  if (!boundary) return;
  const snapshot = captureInteractiveState(boundary.start.parentNode!);
  const range = documentTarget.createRange();
  range.setStartAfter(boundary.start);
  range.setEndBefore(boundary.end);
  range.deleteContents();
  const template = documentTarget.createElement('template');
  template.innerHTML = html;
  boundary.end.parentNode!.insertBefore(template.content, boundary.end);
  restoreInteractiveState(boundary.end.parentNode!, snapshot);
}

function findCommentRange(root: Node, startValue: string, endValue: string): { start: Comment; end: Comment } | undefined {
  const documentTarget = root instanceof Document ? root : root.ownerDocument;
  if (!documentTarget) return undefined;
  const walker = documentTarget.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let start: Comment | undefined;
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (comment.data === startValue) start = comment;
    if (comment.data === endValue && start && start.parentNode === comment.parentNode) return { start, end: comment };
  }
  return undefined;
}

interface InteractiveSnapshot {
  activeSource?: string;
  activeId?: string;
  values: Map<string, { value?: string; checked?: boolean; selectionStart?: number | null; selectionEnd?: number | null }>;
}

function captureInteractiveState(root: Node): InteractiveSnapshot {
  const values = new Map<string, { value?: string; checked?: boolean; selectionStart?: number | null; selectionEnd?: number | null }>();
  const elements = root instanceof Element ? [root, ...root.querySelectorAll('input,textarea,select,[contenteditable]')] : [...(root as ParentNode).querySelectorAll?.('input,textarea,select,[contenteditable]') ?? []];
  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;
    const key = element.dataset['vxSource'] ?? element.id ?? element.getAttribute('name');
    if (!key) continue;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      values.set(key, {
        value: element.value,
        ...('checked' in element ? { checked: (element as HTMLInputElement).checked } : {}),
        ...('selectionStart' in element ? { selectionStart: (element as HTMLInputElement | HTMLTextAreaElement).selectionStart, selectionEnd: (element as HTMLInputElement | HTMLTextAreaElement).selectionEnd } : {})
      });
    }
  }
  const active = root.ownerDocument?.activeElement;
  return {
    ...(active instanceof HTMLElement && root.contains(active) && active.dataset['vxSource'] ? { activeSource: active.dataset['vxSource'] } : {}),
    ...(active instanceof HTMLElement && root.contains(active) && active.id ? { activeId: active.id } : {}),
    values
  };
}

function restoreInteractiveState(root: Node, snapshot: InteractiveSnapshot): void {
  const scope = root instanceof Element ? root : root.parentElement;
  if (!scope) return;
  for (const [key, state] of snapshot.values) {
    const selector = `[data-vx-source="${cssEscape(key)}"],#${cssEscape(key)},[name="${cssEscape(key)}"]`;
    const element = scope.matches(selector) ? scope : scope.querySelector(selector);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      if (state.value !== undefined && element.type !== 'password') element.value = state.value;
      if (state.checked !== undefined && element instanceof HTMLInputElement) element.checked = state.checked;
      if (state.selectionStart != null && state.selectionEnd != null && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        element.setSelectionRange(state.selectionStart, state.selectionEnd);
      }
    }
  }
  const focus = snapshot.activeSource
    ? scope.querySelector<HTMLElement>(`[data-vx-source="${cssEscape(snapshot.activeSource)}"]`)
    : snapshot.activeId ? scope.querySelector<HTMLElement>(`#${cssEscape(snapshot.activeId)}`) : undefined;
  focus?.focus({ preventScroll: true });
}

function collect(node: Node, index: HydrationIndex): void {
  if (node instanceof Element) {
    const sourceId = node.getAttribute('data-vx-source');
    if (sourceId) {
      const entries = index.elements.get(sourceId) ?? [];
      entries.push(node);
      index.elements.set(sourceId, entries);
      index.vxNodes.add(node);
    }
  } else if (node instanceof Comment && node.data.startsWith('vx:')) {
    const entries = index.comments.get(node.data) ?? [];
    entries.push(node);
    index.comments.set(node.data, entries);
    index.vxNodes.add(node);
  }
  for (const child of node.childNodes) collect(child, index);
}

function nodesBetween(start: Comment, end: Comment): Node[] {
  const nodes: Node[] = [];
  for (let node = start.nextSibling; node && node !== end; node = node.nextSibling) nodes.push(node);
  return nodes;
}

function createDiagnostic(
  code: HydrationDiagnosticCode,
  sourceId: string | undefined,
  expected: string | undefined,
  actual: string | undefined,
  node: Node,
  recovered: boolean
): HydrationDiagnostic {
  const details = [expected ? `expected ${expected}` : '', actual ? `received ${actual}` : ''].filter(Boolean).join(', ');
  return Object.freeze({
    code,
    message: `${code}${details ? `: ${details}` : ''}.`,
    ...(sourceId ? { sourceId } : {}),
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
    path: nodePath(node),
    recovered
  });
}

function nodePath(node: Node): string {
  const parts: string[] = [];
  let current: Node | null = node;
  while (current && !(current instanceof Document)) {
    if (current instanceof Element) {
      const source = current.getAttribute('data-vx-source');
      parts.push(`${current.localName}${source ? `[data-vx-source=${source}]` : ''}`);
    } else if (current instanceof Comment) parts.push(`<!--${current.data}-->`);
    else if (current instanceof Text) parts.push('#text');
    current = current.parentNode;
  }
  return parts.reverse().join(' > ');
}

function describeNode(node: Node | null | undefined): string | undefined {
  if (!node) return undefined;
  if (node instanceof Element) return `${node.namespaceURI ?? ''}:${node.localName}`;
  if (node instanceof Comment) return `comment:${node.data}`;
  if (node instanceof Text) return `text:${node.data}`;
  return node.nodeName;
}

function hydrationError(diagnostic: HydrationDiagnostic): Error {
  return new Error(`${diagnostic.message} at ${diagnostic.path ?? 'unknown path'}`);
}

function cssEscape(value: string): string {
  const css = globalThis.CSS as typeof CSS | undefined;
  return css?.escape ? css.escape(value) : value.replace(/[^A-Za-z0-9_-]/g, (character) => `\\${character}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
