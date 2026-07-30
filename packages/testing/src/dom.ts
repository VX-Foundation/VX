export interface RoleQueryOptions { name?: string | RegExp; hidden?: boolean; exact?: boolean; }
export interface DomHarness {
  root: ParentNode;
  getByRole(role: string, options?: RoleQueryOptions): Element;
  queryByRole(role: string, options?: RoleQueryOptions): Element | null;
  getByLabelText(label: string | RegExp): Element;
  fire(element: EventTarget, type: string, init?: EventInit): boolean;
  waitFor<T>(assertion: () => T, options?: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal }): Promise<T>;
}

export function createDomHarness(root: ParentNode): DomHarness {
  return {
    root,
    getByRole(role, options) {
      const result = queryByRole(root, role, options);
      if (!result) throw new Error(`No element with role '${role}' matched the VX DOM query.`);
      return result;
    },
    queryByRole(role, options) { return queryByRole(root, role, options); },
    getByLabelText(label) {
      const element = queryByLabelText(root, label);
      if (!element) throw new Error('No element matched the requested accessible label.');
      return element;
    },
    fire(element, type, init = {}) { return element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...init })); },
    waitFor(assertion, options) { return waitFor(assertion, options); }
  };
}

export function queryByRole(root: ParentNode, role: string, options: RoleQueryOptions = {}): Element | null {
  for (const element of collectElements(root)) {
    if (!options.hidden && isHidden(element)) continue;
    if (computedRole(element) !== role) continue;
    if (options.name !== undefined && !matches(accessibleName(element), options.name, options.exact ?? true)) continue;
    return element;
  }
  return null;
}

export function queryByLabelText(root: ParentNode, label: string | RegExp): Element | null {
  const elements = collectElements(root);
  for (const element of elements) {
    if (element.tagName.toLowerCase() !== 'label' || !matches(normalize(element.textContent ?? ''), label, true)) continue;
    const nativeControl = element instanceof HTMLLabelElement ? element.control : null;
    if (nativeControl) return nativeControl;
    const htmlFor = element.getAttribute('for');
    if (htmlFor) {
      const referenced = element.ownerDocument.getElementById(htmlFor);
      if (referenced) return referenced;
    }
  }
  for (const element of elements) {
    if (!isLabelTarget(element)) continue;
    if (matches(accessibleName(element), label, true)) return element;
  }
  return null;
}

export function accessibleName(element: Element): string {
  const aria = element.getAttribute('aria-label');
  if (aria?.trim()) return normalize(aria);
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const document = element.ownerDocument;
    const value = labelledBy.split(/\s+/u).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
    if (value) return normalize(value);
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labels = [...element.labels ?? []].map((entry) => entry.textContent ?? '').join(' ').trim();
    if (labels) return normalize(labels);
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder) return normalize(element.placeholder);
  }
  const alt = element.getAttribute('alt');
  if (alt !== null) return normalize(alt);
  const title = element.getAttribute('title');
  if (title?.trim()) return normalize(title);
  return normalize(element.textContent ?? '');
}

export async function waitFor<T>(assertion: () => T, options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 1_000;
  const intervalMs = options.intervalMs ?? 16;
  const started = now();
  let lastError: unknown;
  while (now() - started <= timeoutMs) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    try { return assertion(); } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw lastError ?? new Error(`VX waitFor exceeded ${timeoutMs} ms.`);
}

function collectElements(root: ParentNode): Element[] {
  const output: Element[] = [];
  if (root instanceof Element) output.push(root);
  output.push(...root.querySelectorAll('*'));
  return output;
}

function isLabelTarget(element: Element): boolean {
  if (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')) return true;
  return ['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea'].includes(element.tagName.toLowerCase());
}
function computedRole(element: Element): string | null {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit.split(/\s+/u)[0] ?? null;
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/u.test(tag)) return 'heading';
  if (tag === 'button') return 'button';
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  if (tag === 'img') return 'img';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (['button', 'submit', 'reset'].includes(type)) return 'button';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (!['hidden', 'file', 'color'].includes(type)) return 'textbox';
  }
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (tag === 'form') return 'form';
  return null;
}
function isHidden(element: Element): boolean {
  return element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true';
}
function matches(value: string, expected: string | RegExp, exact: boolean): boolean {
  if (expected instanceof RegExp) { expected.lastIndex = 0; const result = expected.test(value); expected.lastIndex = 0; return result; }
  return exact ? value === normalize(expected) : value.includes(normalize(expected));
}
function normalize(value: string): string { return value.replace(/\s+/gu, ' ').trim(); }
function now(): number { return typeof performance === 'undefined' ? Date.now() : performance.now(); }
