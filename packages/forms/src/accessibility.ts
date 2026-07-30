import type { ValidationIssue } from './types.js';

export function fieldControlId(formId: string, path: string): string {
  return `${sanitizeId(formId)}-${sanitizeId(path)}`;
}

export function fieldErrorId(formId: string, path: string): string {
  return `${sanitizeId(formId)}-${sanitizeId(path)}-error`;
}

export function errorSummaryId(formId: string): string {
  return `${sanitizeId(formId)}-errors`;
}

export function applyFieldAccessibility(element: HTMLElement, formId: string, path: string, issues: readonly ValidationIssue[]): void {
  const own = issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
  if (own.length === 0) {
    element.removeAttribute('aria-invalid');
    const describedBy = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).filter((id) => id !== fieldErrorId(formId, path));
    if (describedBy.length) element.setAttribute('aria-describedby', describedBy.join(' '));
    else element.removeAttribute('aria-describedby');
    return;
  }
  element.setAttribute('aria-invalid', 'true');
  const errorId = fieldErrorId(formId, path);
  const describedBy = new Set((element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  describedBy.add(errorId);
  element.setAttribute('aria-describedby', Array.from(describedBy).join(' '));
}

export function focusFirstError(form: HTMLFormElement, issues: readonly ValidationIssue[]): HTMLElement | null {
  for (const issue of issues) {
    const element = form.elements.namedItem(issue.path);
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
      return element;
    }
    if (typeof RadioNodeList !== 'undefined' && element instanceof RadioNodeList) {
      const candidate = Array.from(element).find((entry) => entry instanceof HTMLElement);
      if (candidate instanceof HTMLElement) {
        candidate.focus({ preventScroll: false });
        return candidate;
      }
    }
  }
  return null;
}

export function announceFormResult(form: HTMLFormElement, message: string, assertive = false): void {
  const owner = form.ownerDocument;
  const id = `${form.id || 'vx-form'}-announcer`;
  let region = owner.getElementById(id);
  if (!region) {
    region = owner.createElement('div');
    region.id = id;
    region.setAttribute('role', assertive ? 'alert' : 'status');
    region.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    region.setAttribute('aria-atomic', 'true');
    Object.assign(region.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' });
    form.appendChild(region);
  }
  region.textContent = '';
  queueMicrotask(() => { region!.textContent = message; });
}

function sanitizeId(value: string): string { return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'field'; }
