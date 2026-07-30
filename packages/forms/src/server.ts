import { fieldControlId, fieldErrorId } from './accessibility.js';
import { decodeFormData, type DecodeFormDataOptions } from './decode.js';
import type { FormSubmissionFailure, FormSubmissionResult, Schema, SchemaDescription, ValidationIssue } from './types.js';

export interface ServerFormContext<T> {
  request: Request;
  values: T;
  signal: AbortSignal;
}

export type ServerFormAuthorization = 'public' | 'authenticated';
export type ServerFormCsrfPolicy = 'required' | 'same-origin' | 'disabled';

export interface ServerFormSecurityContext { request: Request; }

export interface ServerFormOptions<T, R = unknown> {
  schema: Schema<T>;
  action: (context: ServerFormContext<T>) => Promise<FormSubmissionResult<R>> | FormSubmissionResult<R>;
  decode?: DecodeFormDataOptions;
  sameOrigin?: boolean;
  maxBodyBytes?: number;
  authorization?: ServerFormAuthorization;
  authorize?: (context: ServerFormSecurityContext) => boolean | Promise<boolean>;
  csrf?: ServerFormCsrfPolicy;
  verifyCsrf?: (request: Request, token: string | undefined) => boolean | Promise<boolean>;
  expectedOrigin?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  onError?: (error: unknown, context: ServerFormSecurityContext) => void | Promise<void>;
}

export interface ServerFormContract {
  id: string;
  name: string;
  schema: string;
  method: 'POST' | 'PUT' | 'PATCH';
  authorization: ServerFormAuthorization;
  csrf: ServerFormCsrfPolicy;
}

export interface DispatchServerFormOptions {
  formId: string;
  authorize?: ServerFormOptions<unknown>['authorize'];
  verifyCsrf?: ServerFormOptions<unknown>['verifyCsrf'];
  expectedOrigin?: string;
  maxBodyBytes?: number;
}

interface RegisteredServerForm { contract: ServerFormContract; options: ServerFormOptions<unknown, unknown>; }
const FORM_REGISTRY = Symbol.for('vx.server.forms.registry');
function formRegistry(): Map<string, RegisteredServerForm> {
  const target = globalThis as typeof globalThis & { [FORM_REGISTRY]?: Map<string, RegisteredServerForm> };
  return target[FORM_REGISTRY] ??= new Map();
}

export function registerServerForm<T, R>(contract: ServerFormContract, options: ServerFormOptions<T, R>): ServerFormContract {
  const normalized = Object.freeze({ ...contract, method: contract.method.toUpperCase() as ServerFormContract['method'] });
  const registry = formRegistry();
  const existing = registry.get(normalized.id);
  if (existing && JSON.stringify(existing.contract) !== JSON.stringify(normalized)) throw new Error(`Server form '${normalized.id}' was registered with a conflicting contract.`);
  registry.set(normalized.id, { contract: normalized, options: options as ServerFormOptions<unknown, unknown> });
  return normalized;
}

export interface ServerFormExecution<T = unknown, R = unknown> {
  response: Response;
  result: FormSubmissionResult<R>;
  rawValues?: Readonly<Record<string, unknown>>;
  values?: T;
}

export interface FormFlashState {
  formId: string;
  values: Readonly<Record<string, unknown>>;
  fieldErrors: readonly ValidationIssue[];
  formError?: string;
  binding?: string;
}

export interface FormFlashStore {
  put(token: string, state: FormFlashState, ttlMs: number): void | Promise<void>;
  take(token: string): FormFlashState | undefined | Promise<FormFlashState | undefined>;
  dispose?(): void | Promise<void>;
}

export function createMemoryFormFlashStore(maxEntries = 1_000): FormFlashStore {
  const values = new Map<string, { state: FormFlashState; expiresAt: number }>();
  const prune = (): void => {
    const now = Date.now();
    for (const [token, entry] of values) if (entry.expiresAt <= now) values.delete(token);
    while (values.size > maxEntries) values.delete(values.keys().next().value as string);
  };
  return {
    put(token, state, ttlMs) {
      prune();
      values.set(token, { state: Object.freeze({ ...state, values: cloneRecord(state.values), fieldErrors: [...state.fieldErrors] }), expiresAt: Date.now() + Math.max(1_000, ttlMs) });
      prune();
    },
    take(token) {
      prune();
      const entry = values.get(token);
      values.delete(token);
      return entry?.state;
    },
    dispose() { values.clear(); }
  };
}

export async function dispatchServerForm(request: Request, options: DispatchServerFormOptions): Promise<Response> {
  return (await executeRegisteredServerForm(request, options)).response;
}

export async function executeRegisteredServerForm(request: Request, options: DispatchServerFormOptions): Promise<ServerFormExecution> {
  const registered = formRegistry().get(options.formId);
  if (!registered) return failureExecution({ ok: false, status: 404, formError: 'Unknown server form.', fieldErrors: [] });
  return executeServerForm(request, {
    ...registered.options,
    method: registered.contract.method,
    authorization: registered.contract.authorization,
    csrf: registered.contract.csrf,
    ...(options.authorize ? { authorize: options.authorize } : {}),
    ...(options.verifyCsrf ? { verifyCsrf: options.verifyCsrf } : {}),
    ...(options.expectedOrigin ? { expectedOrigin: options.expectedOrigin } : {}),
    ...(options.maxBodyBytes !== undefined ? { maxBodyBytes: options.maxBodyBytes } : {})
  });
}

export function createServerForm<T, R = unknown>(options: ServerFormOptions<T, R>) {
  return async function handle(request: Request): Promise<Response> {
    return (await executeServerForm(request, options)).response;
  };
}

export async function executeServerForm<T, R = unknown>(request: Request, options: ServerFormOptions<T, R>): Promise<ServerFormExecution<T, R>> {
  const allowedMethod = options.method ?? 'POST';
  const effectiveMethod = await effectiveRequestMethod(request, allowedMethod);
  if (effectiveMethod !== allowedMethod) return failureExecution({ ok: false, status: 405, formError: 'Method not allowed.', fieldErrors: [] }, { Allow: allowedMethod });
  const csrf = options.csrf ?? 'required';
  if ((options.sameOrigin !== false || csrf !== 'disabled') && !isSameOrigin(request, options.expectedOrigin)) {
    return failureExecution({ ok: false, status: 403, formError: 'Cross-origin form submission rejected.', fieldErrors: [] });
  }
  const authorization = options.authorization ?? 'authenticated';
  if (authorization === 'authenticated' && (!options.authorize || !(await options.authorize({ request })))) {
    return failureExecution({ ok: false, status: 403, formError: 'Authentication is required.', fieldErrors: [] });
  }
  if (csrf === 'required') {
    const token = request.headers.get('x-vx-csrf')?.trim() || await hiddenCsrfToken(request);
    if (!options.verifyCsrf || !(await options.verifyCsrf(request, token))) {
      return failureExecution({ ok: false, status: 403, formError: 'CSRF verification failed.', fieldErrors: [] });
    }
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  const maxBodyBytes = options.maxBodyBytes ?? 16 * 1024 * 1024;
  if (Number.isFinite(length) && length > maxBodyBytes) return failureExecution({ ok: false, status: 413, formError: 'Form payload is too large.', fieldErrors: [] });

  let raw: Record<string, unknown>;
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) raw = decodeFormData(await request.formData(), options.decode);
    else if (contentType.includes('application/json')) raw = sanitizeJson(await request.json());
    else return failureExecution({ ok: false, status: 415, formError: 'Unsupported form content type.', fieldErrors: [] });
  } catch (error) {
    return failureExecution({ ok: false, status: 400, formError: error instanceof Error ? error.message : 'Invalid form payload.', fieldErrors: [] });
  }

  const validation = await options.schema.parseAsync(raw, { phase: 'server', root: raw, signal: request.signal });
  if (!validation.success) {
    const result: FormSubmissionFailure = { ok: false, status: 422, fieldErrors: validation.issues };
    return { response: response(result, 422), result, rawValues: redactFormValues(raw, options.schema.describe()) };
  }

  try {
    const values = validation.value as T;
    const result = await options.action({ request, values, signal: request.signal });
    const output = result.ok && result.redirect && acceptsHtml(request)
      ? new Response(null, { status: 303, headers: { Location: result.redirect, 'Cache-Control': 'no-store' } })
      : response(result, result.status);
    return { response: output, result, rawValues: redactFormValues(raw, options.schema.describe()), values };
  } catch (error) {
    try { await options.onError?.(error, { request }); } catch { /* Observability hooks must not replace the form response. */ }
    const result: FormSubmissionFailure = { ok: false, status: 500, formError: 'Form action failed.', fieldErrors: [] };
    return { response: response(result, 500), result, rawValues: redactFormValues(raw, options.schema.describe()), values: validation.value as T };
  }
}

function failureExecution<R = unknown>(result: FormSubmissionFailure, headers: HeadersInit = {}): ServerFormExecution<never, R> {
  return { response: response(result, result.status, headers), result };
}

export function serverFormAttributes(controller: { config: { id?: string; action?: string; method?: string } }): Readonly<Record<string, unknown>> {
  const method = (controller.config.method ?? 'post').toLowerCase();
  return Object.freeze({
    ...(controller.config.id ? { id: controller.config.id } : {}),
    ...(controller.config.action ? { action: controller.config.action } : {}),
    method: 'post',
    ...(method !== 'post' ? { 'data-vx-method': method } : {}),
    enctype: 'multipart/form-data'
  });
}

export function serverFieldAttributes(
  controller: { config: { id?: string }; field(path: string): { value: unknown; errors: readonly ValidationIssue[] } },
  path: string,
  widgetName: string
): Readonly<Record<string, unknown>> {
  const field = controller.field(path);
  const formId = controller.config.id ?? 'vx-form';
  const attributes: Record<string, unknown> = { name: path, id: fieldControlId(formId, path) };
  if (field.errors.length > 0) {
    attributes['aria-invalid'] = true;
    attributes['aria-describedby'] = fieldErrorId(formId, path);
  }
  if (widgetName === 'Checkbox' || widgetName === 'Radio' || widgetName === 'Switch') attributes['checked'] = Boolean(field.value);
  else if (widgetName !== 'Input' || !isFileLikeValue(field.value)) attributes['value'] = field.value ?? '';
  return Object.freeze(attributes);
}


export function serverFieldErrorAttributes(controller: { config: { id?: string } }, path: string): Readonly<Record<string, unknown>> {
  return Object.freeze({ id: fieldErrorId(controller.config.id ?? 'vx-form', path), role: 'alert' });
}

export function renderErrorSummary(
  controller: { config: { id?: string }; snapshot: { errors: readonly ValidationIssue[] } }
): string {
  if (controller.snapshot.errors.length === 0) return '';
  const formId = controller.config.id ?? 'vx-form';
  return `<ul>${controller.snapshot.errors.map((issue) => `<li><a href="#${escapeHtmlAttribute(fieldControlId(formId, issue.path))}">${escapeHtmlText(issue.message)}</a></li>`).join('')}</ul>`;
}

export function renderMethodOverride(method: string | undefined): string {
  const normalized = (method ?? 'post').toLowerCase();
  if (normalized === 'post') return '';
  if (normalized !== 'put' && normalized !== 'patch') throw new TypeError(`Unsupported native form method '${method}'.`);
  return `<input type="hidden" name="_vx_method" value="${normalized.toUpperCase()}">`;
}

export function renderCsrfField(token: string | undefined): string {
  if (!token) return '';
  return `<input type="hidden" name="_vx_csrf" value="${escapeHtmlAttribute(token)}">`;
}

function isFileLikeValue(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string');
}
function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fieldError(path: string, message: string, code = 'server'): ValidationIssue { return { path, message, code, phase: 'server' }; }
export function redirect(location: string, status = 303): Response { return new Response(null, { status, headers: { Location: location, 'Cache-Control': 'no-store' } }); }

function response(body: FormSubmissionResult, status: number, headers: HeadersInit = {}): Response { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', ...headers } }); }
function acceptsHtml(request: Request): boolean { return (request.headers.get('accept') ?? '').includes('text/html'); }
function isSameOrigin(request: Request, expected?: string): boolean { const origin = request.headers.get('origin'); if (!origin) return true; try { return origin === (expected ?? new URL(request.url).origin); } catch { return false; } }
async function hiddenCsrfToken(request: Request): Promise<string | undefined> { return hiddenFormValue(request, '_vx_csrf'); }
async function hiddenFormValue(request: Request, name: string): Promise<string | undefined> { try { const contentType = request.headers.get('content-type') ?? ''; if (!contentType.includes('form')) return undefined; const data = await request.clone().formData(); const value = data.get(name); return typeof value === 'string' ? value : undefined; } catch { return undefined; } }
async function effectiveRequestMethod(request: Request, allowedMethod: ServerFormContract['method']): Promise<string> {
  const actual = request.method.toUpperCase();
  if (actual !== 'POST' || allowedMethod === 'POST') return actual;
  const override = (await hiddenFormValue(request, '_vx_method'))?.toUpperCase();
  return override === 'PUT' || override === 'PATCH' ? override : actual;
}
function redactFormValues(value: Readonly<Record<string, unknown>>, description: SchemaDescription): Record<string, unknown> {
  const visit = (entry: unknown, schemaDescription: SchemaDescription | undefined): unknown => {
    if (schemaDescription?.rules?.some((rule) => rule['name'] === 'sensitive')) return '';
    if (schemaDescription?.kind === 'file') return null;
    if (Array.isArray(entry)) return entry.map((item) => visit(item, schemaDescription?.item));
    if (!entry || typeof entry !== 'object') return entry;
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
      if (key.startsWith('_vx_')) continue;
      output[key] = visit(item, schemaDescription?.fields?.[key]);
    }
    return output;
  };
  return visit(value, description) as Record<string, unknown>;
}

function cloneRecord(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

function sanitizeJson(value: unknown): Record<string, unknown> {
  let nodes = 0;
  const visit = (entry: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 10_000) throw new RangeError('JSON form payload contains too many values.');
    if (depth > 32) throw new RangeError('JSON form payload is too deeply nested.');
    if (Array.isArray(entry)) return entry.map((item) => visit(item, depth + 1));
    if (!entry || typeof entry !== 'object') return entry;
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new TypeError(`Unsafe JSON form key '${key}'.`);
      output[key] = visit(item, depth + 1);
    }
    return output;
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('JSON form payload must be an object.');
  return visit(value, 0) as Record<string, unknown>;
}
