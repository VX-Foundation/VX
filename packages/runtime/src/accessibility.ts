import type { Cleanup } from './dom.js';

export interface ContrastResult { ratio: number; level: 'fail' | 'aa-large' | 'aa' | 'aaa'; foreground: string; background: string; }
export interface AccessibilityIssue { code: string; severity: 'error' | 'warning'; message: string; element?: Element; suggestion: string; }
export interface FocusTrap { activate(): void; pause(): void; resume(): void; deactivate(): void; }

export function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(/\s+/).map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ');
  const label = element.getAttribute('aria-label'); if (label?.trim()) return label.trim();
  if (element instanceof HTMLInputElement && element.id) { const explicit = element.ownerDocument.querySelector(`label[for="${cssEscape(element.id)}"]`); if (explicit?.textContent?.trim()) return explicit.textContent.trim(); }
  return element.textContent?.trim() ?? '';
}

export function createFocusTrap(container: HTMLElement, options: { initialFocus?: HTMLElement; returnFocus?: HTMLElement; escapeDeactivates?: boolean } = {}): FocusTrap {
  let active = false; let paused = false; const returnFocus = options.returnFocus ?? (container.ownerDocument.activeElement as HTMLElement | null) ?? undefined;
  const onKey = (event: KeyboardEvent): void => {
    if (!active || paused) return;
    if (event.key === 'Escape' && options.escapeDeactivates !== false) { trap.deactivate(); return; }
    if (event.key !== 'Tab') return;
    const nodes = focusable(container); if (!nodes.length) { event.preventDefault(); container.focus(); return; }
    const first = nodes[0]!; const last = nodes.at(-1)!; const current = container.ownerDocument.activeElement;
    if (event.shiftKey && current === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
  };
  const trap: FocusTrap = {
    activate() { if (active) return; active = true; container.addEventListener('keydown', onKey); (options.initialFocus ?? focusable(container)[0] ?? container).focus(); },
    pause() { paused = true; }, resume() { paused = false; },
    deactivate() { if (!active) return; active = false; container.removeEventListener('keydown', onKey); returnFocus?.focus?.(); }
  };
  return trap;
}

export function createRovingTabIndex(container: HTMLElement, selector = '[role="option"],[role="menuitem"],[role="tab"],[data-vx-roving]'): Cleanup {
  const items = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(selector)].filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true');
  const sync = (active: HTMLElement | undefined): void => items().forEach((item) => item.tabIndex = item === active ? 0 : -1);
  sync(items()[0]);
  const onKey = (event: KeyboardEvent): void => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const values = items(); if (!values.length) return; const current = values.indexOf(container.ownerDocument.activeElement as HTMLElement); let next = current;
    if (event.key === 'Home') next = 0; else if (event.key === 'End') next = values.length - 1; else next = (current + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length;
    event.preventDefault(); sync(values[next]); values[next]?.focus();
  };
  container.addEventListener('keydown', onKey); return () => container.removeEventListener('keydown', onKey);
}

export function announce(message: string, options: { politeness?: 'polite' | 'assertive'; document?: Document } = {}): void {
  const document_ = options.document ?? document; const id = `vx-announcer-${options.politeness ?? 'polite'}`;
  let region = document_.getElementById(id); if (!region) { region = document_.createElement('div'); region.id = id; region.setAttribute('aria-live', options.politeness ?? 'polite'); region.setAttribute('aria-atomic', 'true'); Object.assign((region as HTMLElement).style, visuallyHiddenStyle); document_.body.appendChild(region); }
  region.textContent = ''; queueMicrotask(() => { region!.textContent = message; });
}

export function contrast(foreground: string, background: string): ContrastResult {
  const ratio = contrastRatio(parseColor(foreground), parseColor(background));
  return { ratio, level: ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : ratio >= 3 ? 'aa-large' : 'fail', foreground, background };
}

export function auditAccessibility(root: ParentNode): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  for (const image of root.querySelectorAll('img')) if (!image.hasAttribute('alt')) issues.push(issue('VX_A11Y_IMAGE_ALT', 'error', 'Image has no alt attribute.', image, 'Add descriptive alt text or alt="" for decorative imagery.'));
  for (const control of root.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')) if (!accessibleName(control)) issues.push(issue('VX_A11Y_NAME', 'error', 'Interactive element has no accessible name.', control, 'Add visible text, aria-label, or aria-labelledby.'));
  for (const element of root.querySelectorAll('[tabindex]')) { const value = Number(element.getAttribute('tabindex')); if (value > 0) issues.push(issue('VX_A11Y_TAB_ORDER', 'error', 'Positive tabindex changes the natural keyboard order.', element, 'Use tabindex="0" or "-1".')); }
  for (const dialog of root.querySelectorAll('[role="dialog"],[role="alertdialog"]')) if (dialog.getAttribute('aria-modal') !== 'true') issues.push(issue('VX_A11Y_DIALOG_MODAL', 'warning', 'Dialog does not declare modal behavior.', dialog, 'Set aria-modal="true" and trap focus while open.'));
  return issues;
}

const visuallyHiddenStyle = { position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: '0' } as const;
function focusable(container: HTMLElement): HTMLElement[] { return [...container.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true'); }
function issue(code: string, severity: 'error' | 'warning', message: string, element: Element, suggestion: string): AccessibilityIssue { return { code, severity, message, element, suggestion }; }
function cssEscape(value: string): string { return value.replace(/["\\]/g, '\\$&'); }
function parseColor(value: string): [number, number, number] { const match = /^#([0-9a-f]{6})$/i.exec(value.trim()); if (!match) throw new TypeError(`Contrast validation currently requires six-digit hex colors, received '${value}'.`); const hex = match[1]!; return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]; }
function luminance([r, g, b]: [number, number, number]): number { const convert = (value: number) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; return .2126 * convert(r) + .7152 * convert(g) + .0722 * convert(b); }
function contrastRatio(a: [number, number, number], b: [number, number, number]): number { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light! + .05) / (dark! + .05); }
