import { accessibleName } from './dom.js';

export interface AccessibilityIssue {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  selector: string;
  suggestion: string;
}
export interface AccessibilityAudit { passed: boolean; issues: readonly AccessibilityIssue[]; }
export interface AccessibilityAuditOptions {
  minimumContrast?: number;
  minimumLargeTextContrast?: number;
  style?(element: Element): { color?: string; backgroundColor?: string; fontSizePx?: number; fontWeight?: number };
}

export function auditAccessibility(root: ParentNode, options: AccessibilityAuditOptions = {}): AccessibilityAudit {
  const issues: AccessibilityIssue[] = [];
  const ids = new Map<string, Element[]>();
  for (const element of collect(root)) {
    const id = element.id;
    if (id) (ids.get(id) ?? (ids.set(id, []), ids.get(id)!)).push(element);
    const tag = element.tagName.toLowerCase();
    if (tag === 'img' && !element.hasAttribute('alt')) add(issues, element, 'VX_A11Y_IMAGE_ALT', 'error', 'Image has no alt attribute.', 'Add alt text, or alt="" for a decorative image.');
    if (isInteractive(element) && !accessibleName(element)) add(issues, element, 'VX_A11Y_NAME', 'error', 'Interactive control has no accessible name.', 'Add visible text, a native label, aria-label, or aria-labelledby.');
    const tabindex = element.getAttribute('tabindex');
    if (tabindex !== null && Number(tabindex) > 0) add(issues, element, 'VX_A11Y_TABINDEX', 'warning', 'Positive tabindex changes the natural keyboard order.', 'Use tabindex="0" or native document order.');
    if (element.getAttribute('role') === 'dialog') {
      if (!accessibleName(element)) add(issues, element, 'VX_A11Y_DIALOG_NAME', 'error', 'Dialog has no accessible name.', 'Reference its visible heading with aria-labelledby.');
      if (element.getAttribute('aria-modal') !== 'true') add(issues, element, 'VX_A11Y_DIALOG_MODAL', 'warning', 'Dialog does not declare aria-modal="true".', 'Declare modal behavior and use a focus trap when the background is inert.');
    }
    if (tag === 'html' && !element.getAttribute('lang')) add(issues, element, 'VX_A11Y_DOCUMENT_LANG', 'error', 'Document language is missing.', 'Set a valid lang attribute on the html element.');
    auditElementContrast(issues, element, options);
  }
  for (const [id, elements] of ids) if (elements.length > 1) for (const element of elements) add(issues, element, 'VX_A11Y_DUPLICATE_ID', 'error', `Duplicate id '${id}'.`, 'Generate a unique deterministic id for every element.');
  return Object.freeze({ passed: !issues.some((issue) => issue.severity === 'error'), issues: Object.freeze(issues) });
}

export function contrastRatio(foreground: string, background: string): number {
  const left = luminance(parseHex(foreground));
  const right = luminance(parseHex(background));
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function collect(root: ParentNode): Element[] { return [...(root instanceof Element ? [root] : []), ...root.querySelectorAll('*')]; }
function isInteractive(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return ['button', 'select', 'textarea'].includes(tag) || (tag === 'a' && element.hasAttribute('href')) || (tag === 'input' && element.getAttribute('type') !== 'hidden') || ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'menuitem', 'tab'].includes(element.getAttribute('role') ?? '');
}
function add(issues: AccessibilityIssue[], element: Element, code: string, severity: AccessibilityIssue['severity'], message: string, suggestion: string): void {
  issues.push({ code, severity, message, selector: selector(element), suggestion });
}
function selector(element: Element): string {
  if (element.id) return `#${escapeSelector(element.id)}`;
  const part = element.getAttribute('data-vx-part');
  if (part) return `[data-vx-part="${part}"]`;
  return element.tagName.toLowerCase();
}
function escapeSelector(value: string): string { return value.replace(/[^A-Za-z0-9_-]/gu, (character) => `\\${character}`); }
function auditElementContrast(issues: AccessibilityIssue[], element: Element, options: AccessibilityAuditOptions): void {
  const text = (element.textContent ?? '').trim();
  if (!text || ['script', 'style', 'template', 'svg'].includes(element.tagName.toLowerCase())) return;
  const style = options.style?.(element) ?? browserStyle(element);
  if (!style?.color || !style.backgroundColor || isTransparent(style.backgroundColor)) return;
  let ratio: number;
  try { ratio = contrastRatio(normalizeColor(style.color), normalizeColor(style.backgroundColor)); } catch { return; }
  const large = (style.fontSizePx ?? 16) >= 24 || ((style.fontSizePx ?? 16) >= 18.66 && (style.fontWeight ?? 400) >= 700);
  const minimum = large ? options.minimumLargeTextContrast ?? 3 : options.minimumContrast ?? 4.5;
  if (ratio + Number.EPSILON < minimum) add(issues, element, 'VX_A11Y_CONTRAST', 'error', `Text contrast ${ratio.toFixed(2)}:1 is below ${minimum.toFixed(1)}:1.`, 'Choose foreground and background tokens that meet the required WCAG contrast ratio.');
}
function browserStyle(element: Element): { color?: string; backgroundColor?: string; fontSizePx?: number; fontWeight?: number } | undefined {
  const view = element.ownerDocument.defaultView;
  if (!view) return undefined;
  const computed = view.getComputedStyle(element);
  return { color: computed.color, backgroundColor: computed.backgroundColor, fontSizePx: Number.parseFloat(computed.fontSize), fontWeight: Number.parseInt(computed.fontWeight, 10) || 400 };
}
function normalizeColor(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/iu.exec(trimmed);
  if (!match) throw new TypeError(`Unsupported color '${value}'.`);
  return `#${[match[1], match[2], match[3]].map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0')).join('')}`;
}
function isTransparent(value: string): boolean { return value === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/iu.test(value); }
function parseHex(value: string): [number, number, number] {
  const source = value.trim().replace(/^#/u, '');
  const expanded = source.length === 3 ? [...source].map((item) => `${item}${item}`).join('') : source;
  if (!/^[0-9a-f]{6}$/iu.test(expanded)) throw new TypeError(`Expected a #RGB or #RRGGBB color, received '${value}'.`);
  return [Number.parseInt(expanded.slice(0, 2), 16), Number.parseInt(expanded.slice(2, 4), 16), Number.parseInt(expanded.slice(4, 6), 16)];
}
function luminance([red, green, blue]: [number, number, number]): number {
  const channels = [red, green, blue].map((value) => { const normalized = value / 255; return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; });
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
