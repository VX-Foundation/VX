import { announceFormResult, applyFieldAccessibility, fieldControlId, fieldErrorId, focusFirstError } from './accessibility.js';
import { decodeFormData } from './decode.js';
import type { FormController } from './controller.js';
import type { FormSubmissionResult, ValidationIssue } from './types.js';

export interface EnhanceFormOptions<T extends Record<string, unknown>, R = unknown> {
  controller: FormController<T, R>;
  action?: string;
  method?: string;
  headers?: HeadersInit;
  navigate?: (location: string) => void | Promise<void>;
  onResult?: (result: FormSubmissionResult<R>) => void;
  onProgress?: (loaded: number, total?: number) => void;
  focusErrors?: boolean;
  preserveNativeValidation?: boolean;
}

export function enhanceForm<T extends Record<string, unknown>, R = unknown>(form: HTMLFormElement, options: EnhanceFormOptions<T, R>): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  let submissionController: AbortController | null = null;
  if (options.preserveNativeValidation !== true) form.noValidate = true;
  const syncFromElement = (target: EventTarget | null, phase: 'input' | 'blur'): void => {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (!target.name) return;
    const value = readControlValue(target, form);
    if (phase === 'input') options.controller.setValue(target.name, value, { validate: true });
    else options.controller.blur(target.name);
  };

  form.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      if (target.name) options.controller.focus(target.name);
    }
  }, { signal });
  form.addEventListener('input', (event) => syncFromElement(event.target, 'input'), { signal });
  form.addEventListener('change', (event) => syncFromElement(event.target, 'input'), { signal });
  form.addEventListener('focusout', (event) => syncFromElement(event.target, 'blur'), { signal });
  form.addEventListener('reset', () => queueMicrotask(() => options.controller.reset(decodeFormData(new FormData(form)) as T)), { signal });

  form.addEventListener('submit', (event) => {
    const submitEvent = event as SubmitEvent;
    if (options.preserveNativeValidation === true && !form.reportValidity()) return;
    event.preventDefault();
    submissionController?.abort();
    submissionController = new AbortController();
    void submitEnhanced(form, options, submitEvent.submitter, submissionController.signal).finally(() => {
      if (submissionController?.signal.aborted === false) submissionController = null;
    });
  }, { signal });

  const unsubscribe = options.controller.subscribe((snapshot) => {
    form.toggleAttribute('aria-busy', snapshot.pending);
    for (const control of Array.from(form.elements)) {
      if (!(control instanceof HTMLElement)) continue;
      const name = control.getAttribute('name');
      if (!name) continue;
      applyFieldAccessibility(control, form.id || options.controller.config.id || 'vx-form', name, snapshot.errors);
    }
  });

  return () => { controller.abort(); submissionController?.abort(); unsubscribe(); options.controller.cancel(); };
}

async function submitEnhanced<T extends Record<string, unknown>, R>(form: HTMLFormElement, options: EnhanceFormOptions<T, R>, submitter: HTMLElement | null, signal: AbortSignal): Promise<void> {
  const formData = new FormData(form, submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
  for (const [key, value] of Object.entries(decodeFormData(formData))) options.controller.setValue(key, value);
  const valid = await options.controller.validate('submit');
  if (!valid) {
    const issues = options.controller.snapshot.errors;
    if (options.focusErrors !== false) focusFirstError(form, issues);
    announceFormResult(form, `${issues.length} form field${issues.length === 1 ? '' : 's'} require attention.`, true);
    return;
  }

  let result: FormSubmissionResult<R>;
  if (options.action ?? options.controller.config.action ?? form.getAttribute('action')) {
    result = await sendForm(form, formData, options, submitter, signal);
  } else {
    result = await options.controller.submit();
  }
  options.onResult?.(result);
  if (result.ok) {
    announceFormResult(form, 'Form submitted successfully.');
    if (result.redirect) {
      if (options.navigate) await options.navigate(result.redirect);
      else window.location.assign(result.redirect);
    }
    if (result.reset) form.reset();
  } else {
    options.controller.setServerErrors(result.fieldErrors, result.formError);
    if (options.focusErrors !== false) focusFirstError(form, result.fieldErrors);
    announceFormResult(form, result.formError ?? 'The form contains errors.', true);
    renderServerErrors(form, result.fieldErrors);
  }
}

async function sendForm<T extends Record<string, unknown>, R>(form: HTMLFormElement, data: FormData, options: EnhanceFormOptions<T, R>, submitter: HTMLElement | null, signal: AbortSignal): Promise<FormSubmissionResult<R>> {
  const submitAction = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter.getAttribute('formaction') : null;
  const submitMethod = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter.getAttribute('formmethod') : null;
  const action = submitAction ?? options.action ?? options.controller.config.action ?? form.getAttribute('action') ?? window.location.href;
  const method = (submitMethod ?? options.method ?? options.controller.config.method ?? form.getAttribute('method') ?? 'post').toUpperCase();
  if (options.onProgress && hasFiles(data)) return uploadWithProgress<R>(action, method, data, options.headers, options.onProgress, signal);
  const csrf = document.querySelector<HTMLMetaElement>('meta[name="vx-csrf"]')?.content;
  const response = await fetch(action, { method, body: data, headers: { Accept: 'application/json', ...(csrf ? { 'x-vx-csrf': csrf } : {}), ...options.headers }, credentials: 'same-origin', signal });
  return parseResponse<R>(response);
}

function uploadWithProgress<R>(url: string, method: string, data: FormData, headers: HeadersInit | undefined, progress: (loaded: number, total?: number) => void, signal: AbortSignal): Promise<FormSubmissionResult<R>> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.withCredentials = true;
    request.setRequestHeader('Accept', 'application/json');
    const csrf = document.querySelector<HTMLMetaElement>('meta[name="vx-csrf"]')?.content;
    if (csrf) request.setRequestHeader('x-vx-csrf', csrf);
    for (const [name, value] of new Headers(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener('progress', (event) => progress(event.loaded, event.lengthComputable ? event.total : undefined));
    request.addEventListener('load', () => {
      try { resolve(JSON.parse(request.responseText) as FormSubmissionResult<R>); }
      catch { resolve({ ok: false, status: request.status || 500, formError: 'Invalid server response.', fieldErrors: [] }); }
    });
    request.addEventListener('error', () => resolve({ ok: false, status: 0, formError: 'Network error.', fieldErrors: [] }));
    request.addEventListener('abort', () => resolve({ ok: false, status: 499, formError: 'Upload cancelled.', fieldErrors: [] }));
    signal.addEventListener('abort', () => request.abort(), { once: true });
    request.send(data);
  });
}

async function parseResponse<R>(response: Response): Promise<FormSubmissionResult<R>> {
  if (response.redirected) return { ok: true, status: response.status, redirect: response.url };
  try { return await response.json() as FormSubmissionResult<R>; }
  catch { return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status, formError: response.statusText || 'Form submission failed.', fieldErrors: [] }; }
}
function readControlValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, form: HTMLFormElement): unknown {
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    const group = Array.from(form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${CSS.escape(control.name)}"]`));
    if (group.length > 1) return group.filter((entry) => entry.checked).map((entry) => entry.value);
    return control.checked;
  }
  if (control instanceof HTMLInputElement && control.type === 'radio') return form.querySelector<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(control.name)}"]:checked`)?.value;
  if (control instanceof HTMLInputElement && control.type === 'file') return control.multiple ? Array.from(control.files ?? []) : control.files?.[0];
  if (control instanceof HTMLSelectElement && control.multiple) return Array.from(control.selectedOptions).map((entry) => entry.value);
  return control.value;
}
function hasFiles(data: FormData): boolean { for (const value of data.values()) if (typeof File !== 'undefined' && value instanceof File) return true; return false; }
function renderServerErrors(form: HTMLFormElement, issues: readonly ValidationIssue[]): void { for (const issue of issues) { const element = form.ownerDocument.getElementById(`${form.id || 'vx-form'}-${issue.path.replace(/[^A-Za-z0-9_-]+/g, '-')}-error`); if (element) element.textContent = issue.message; } }

const VX_FORM_CONTROLLER = Symbol.for('vx.form.controller');

export function bindFormElement<T extends Record<string, unknown>, R>(element: HTMLFormElement, controller: FormController<T, R>, options: Omit<EnhanceFormOptions<T, R>, 'controller'> = {}): () => void {
  Object.defineProperty(element, VX_FORM_CONTROLLER, { value: controller, configurable: true });
  const csrf = element.ownerDocument.querySelector<HTMLMetaElement>('meta[name="vx-csrf"]')?.content;
  let csrfInput = element.querySelector<HTMLInputElement>('input[name="_vx_csrf"]');
  if (csrf && !csrfInput) {
    csrfInput = element.ownerDocument.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = '_vx_csrf';
    csrfInput.value = csrf;
    element.prepend(csrfInput);
  }
  const merged = {
    ...(controller.config.action ? { action: controller.config.action } : {}),
    ...(controller.config.method ? { method: controller.config.method } : {}),
    ...(controller.config.focusErrors !== undefined ? { focusErrors: controller.config.focusErrors } : {}),
    ...options
  };
  if (controller.config.enhance === false) return () => { delete (element as unknown as Record<PropertyKey, unknown>)[VX_FORM_CONTROLLER]; };
  const cleanup = enhanceForm(element, { controller, ...merged });
  return () => {
    cleanup();
    delete (element as unknown as Record<PropertyKey, unknown>)[VX_FORM_CONTROLLER];
  };
}

export function bindFormField(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, path: string): () => void {
  const form = element.closest('form') as (HTMLFormElement & Record<PropertyKey, unknown>) | null;
  const controller = form?.[VX_FORM_CONTROLLER];
  if (!isFormController(controller)) throw new Error(`Field '${path}' must be nested under a VX Form with a controller.`);
  element.name ||= path;
  element.id ||= fieldControlId(form?.id || controller.config.id || 'vx-form', path);
  const sync = (snapshot: ReturnType<typeof controller.field>): void => {
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) element.checked = Boolean(snapshot.value);
    else if (element instanceof HTMLInputElement && element.type === 'file') { /* file inputs cannot be assigned programmatically */ }
    else if (element instanceof HTMLSelectElement && element.multiple && Array.isArray(snapshot.value)) {
      for (const option of Array.from(element.options)) option.selected = snapshot.value.includes(option.value);
    } else if (element.value !== String(snapshot.value ?? '')) element.value = String(snapshot.value ?? '');
    applyFieldAccessibility(element, form?.id || controller.config.id || 'vx-form', path, snapshot.errors);
  };
  const unsubscribe = controller.subscribeField(path, sync);
  return unsubscribe;
}

export function bindFieldError(element: HTMLElement, path: string): () => void {
  const form = element.closest('form') as (HTMLFormElement & Record<PropertyKey, unknown>) | null;
  const controller = form?.[VX_FORM_CONTROLLER];
  if (!isFormController(controller)) throw new Error(`Field error '${path}' must be nested under a VX Form with a controller.`);
  element.id ||= fieldErrorId(form?.id || controller.config.id || 'vx-form', path);
  element.setAttribute('role', element.getAttribute('role') ?? 'alert');
  return controller.subscribeField(path, (field) => {
    const message = field.errors.map((issue) => issue.message).join(' ');
    element.textContent = message;
    element.hidden = message.length === 0;
    const control = form?.elements.namedItem(path);
    if (control instanceof HTMLElement) {
      if (message) control.setAttribute('aria-describedby', mergeTokens(control.getAttribute('aria-describedby'), element.id));
      else removeToken(control, 'aria-describedby', element.id);
    }
  });
}

export function bindFormError<T extends Record<string, unknown>>(element: HTMLElement, controller: FormController<T, unknown>): () => void {
  element.setAttribute('role', element.getAttribute('role') ?? 'alert');
  return controller.subscribe((snapshot) => {
    const message = snapshot.status === 'failure' && typeof snapshot.result === 'string' ? snapshot.result : '';
    element.textContent = message;
    element.hidden = message.length === 0;
  });
}

export function bindErrorSummary<T extends Record<string, unknown>>(element: HTMLElement, controller: FormController<T, unknown>): () => void {
  element.setAttribute('role', element.getAttribute('role') ?? 'alert');
  return controller.subscribe((snapshot) => {
    element.replaceChildren();
    if (snapshot.errors.length === 0) { element.hidden = true; return; }
    element.hidden = false;
    const list = element.ownerDocument.createElement('ul');
    for (const issue of snapshot.errors) {
      const item = element.ownerDocument.createElement('li');
      const link = element.ownerDocument.createElement('a');
      link.href = `#${fieldControlId(element.closest('form')?.id || controller.config.id || 'vx-form', issue.path)}`;
      link.textContent = issue.message;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const control = element.closest('form')?.elements.namedItem(issue.path);
        if (control instanceof HTMLElement) control.focus();
      }, { once: true });
      item.appendChild(link);
      list.appendChild(item);
    }
    element.appendChild(list);
  });
}
function mergeTokens(value: string | null, token: string): string { return Array.from(new Set([...(value?.split(/\s+/).filter(Boolean) ?? []), token])).join(' '); }
function removeToken(element: HTMLElement, name: string, token: string): void { const next = (element.getAttribute(name) ?? '').split(/\s+/).filter((entry) => entry && entry !== token); if (next.length) element.setAttribute(name, next.join(' ')); else element.removeAttribute(name); }

function isFormController(value: unknown): value is FormController<Record<string, unknown>, unknown> {
  return Boolean(value && typeof value === 'object' && typeof (value as FormController<Record<string, unknown>>).subscribeField === 'function');
}
