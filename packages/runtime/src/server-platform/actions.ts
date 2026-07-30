import { currentServerRequest, runWithServerRequest, type ServerRequestContext } from './request-context.js';
import { createRequestRuntime } from '../request-runtime.js';
import { deserializeServerValue, serializeServerValue } from './serialization.js';

export type ServerActionAuthorization = 'public' | 'authenticated';
export type ServerActionCsrfPolicy = 'required' | 'same-origin' | 'disabled';

export interface ServerActionParameterContract {
  name: string;
  type?: string;
  optional: boolean;
}

export interface ServerActionContract {
  id: string;
  name: string;
  parameters: readonly ServerActionParameterContract[];
  returnType?: string;
  authorization: ServerActionAuthorization;
  csrf: ServerActionCsrfPolicy;
}

export type ServerActionHandler = (...args: unknown[]) => unknown | Promise<unknown>;

interface RegisteredServerAction {
  contract: ServerActionContract;
  handler: ServerActionHandler;
}

export interface ServerActionAuthorizationContext {
  request: Request;
  action: ServerActionContract;
  locals: Readonly<Record<string, unknown>>;
}

export interface DispatchServerActionOptions {
  requestId?: string;
  actionName?: string;
  applicationId?: string;
  sessionId?: string;
  routeId?: string;
  locals?: Readonly<Record<string, unknown>>;
  maxBodyBytes?: number;
  expectedOrigin?: string;
  authorize?: (context: ServerActionAuthorizationContext) => boolean | Promise<boolean>;
  verifyCsrf?: (request: Request, action: ServerActionContract) => boolean | Promise<boolean>;
}

const serverActions = new Map<string, RegisteredServerAction>();

export function registerServerAction<T extends ServerActionHandler>(name: string, handler: T): T;
export function registerServerAction<T extends ServerActionHandler>(contract: ServerActionContract, handler: T): T;
export function registerServerAction<T extends ServerActionHandler>(nameOrContract: string | ServerActionContract, handler: T): T {
  const contract = normalizeContract(typeof nameOrContract === 'string'
    ? defaultContract(nameOrContract)
    : nameOrContract);
  const existing = serverActions.get(contract.id);
  if (existing) {
    if (!contractsEqual(existing.contract, contract)) {
      throw new Error(`Server action id '${contract.id}' is already registered with a different contract.`);
    }
    serverActions.set(contract.id, { contract, handler });
    return handler;
  }
  serverActions.set(contract.id, { contract, handler });
  return handler;
}

export function getServerAction(nameOrId: string): ServerActionHandler | undefined {
  return findAction(nameOrId)?.handler;
}

export function getServerActionContract(nameOrId: string): ServerActionContract | undefined {
  return findAction(nameOrId)?.contract;
}

export async function invokeServerAction(nameOrId: string, args: unknown[]): Promise<unknown> {
  const action = findAction(nameOrId);
  if (!action) throw new Error(`Unknown server action '${nameOrId}'.`);
  validateArguments(action.contract, args);
  const value = await action.handler(...args);
  validateReturnValue(action.contract, value);
  return value;
}

export async function dispatchServerAction(request: Request, options: DispatchServerActionOptions = {}): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { ok: false, error: { code: 'VX_ACTION_METHOD', message: 'Server actions require POST.' } }, { allow: 'POST' });
  const actionName = options.actionName ?? actionNameFromURL(request.url);
  const action = actionName ? findAction(actionName) : undefined;
  if (!action) return jsonResponse(404, { ok: false, error: { code: 'VX_ACTION_UNKNOWN', message: 'Unknown server action.' } });

  const originFailure = validateOrigin(request, options.expectedOrigin, action.contract.csrf);
  if (originFailure) return originFailure;
  if (action.contract.csrf === 'required') {
    if (!options.verifyCsrf || !(await options.verifyCsrf(request, action.contract))) {
      return jsonResponse(403, { ok: false, error: { code: 'VX_ACTION_CSRF', message: 'CSRF verification failed.' } });
    }
  }

  const locals = options.locals ?? Object.freeze({});
  if (action.contract.authorization === 'authenticated') {
    const authorized = options.authorize
      ? await options.authorize({ request, action: action.contract, locals })
      : Boolean(options.sessionId);
    if (!authorized) {
      return jsonResponse(403, { ok: false, error: { code: 'VX_ACTION_FORBIDDEN', message: 'The action is not authorized.' } });
    }
  }

  let args: unknown[];
  try {
    args = await parseActionBody(request, normalizeMaximumBodyBytes(options.maxBodyBytes));
    validateArguments(action.contract, args);
  } catch (error) {
    return jsonResponse(400, { ok: false, error: { code: 'VX_ACTION_INPUT', message: errorMessage(error) } });
  }

  const requestId = options.requestId ?? cryptoRandomId();
  const runtime = createRequestRuntime({
    requestId,
    ...(options.applicationId ? { applicationId: options.applicationId } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.routeId ? { routeId: options.routeId } : {})
  });
  const context: ServerRequestContext = {
    request,
    runtime,
    ...(options.routeId ? { routeId: options.routeId } : {}),
    params: Object.freeze({}),
    locals,
    signal: request.signal
  };

  try {
    const value = await runWithServerRequest(context, () => action.handler(...args));
    validateReturnValue(action.contract, value);
    return jsonResponse(200, { ok: true, value });
  } catch (error) {
    const publicError = normalizePublicError(error);
    return jsonResponse(publicError.status, { ok: false, error: { code: publicError.code, message: publicError.message } });
  } finally {
    runtime.dispose();
  }
}

export function serverActionRequest(): ServerRequestContext {
  return currentServerRequest();
}

function normalizeContract(contract: ServerActionContract): ServerActionContract {
  if (!contract.id.trim() || !contract.name.trim()) throw new TypeError('Server action contract requires a stable id and name.');
  if (contract.id.length > 256 || contract.name.length > 128) throw new TypeError('Server action id or name exceeds the safety limit.');
  if (contract.authorization !== 'public' && contract.authorization !== 'authenticated') throw new TypeError('Invalid server action authorization policy.');
  if (!['required', 'same-origin', 'disabled'].includes(contract.csrf)) throw new TypeError('Invalid server action CSRF policy.');
  if (contract.parameters.length > 32) throw new TypeError('Server actions support at most 32 parameters.');
  const names = new Set<string>();
  let optionalSeen = false;
  const parameters = contract.parameters.map((parameter) => {
    if (!parameter.name.trim() || names.has(parameter.name)) throw new TypeError(`Invalid or duplicate server action parameter '${parameter.name}'.`);
    names.add(parameter.name);
    if (parameter.optional) optionalSeen = true;
    else if (optionalSeen) throw new TypeError('Required server action parameters cannot follow optional parameters.');
    return Object.freeze({ ...parameter });
  });
  return Object.freeze({ ...contract, parameters: Object.freeze(parameters) });
}

function defaultContract(name: string): ServerActionContract {
  return Object.freeze({
    id: name,
    name,
    parameters: Object.freeze([]),
    authorization: 'authenticated',
    csrf: 'required'
  });
}

function findAction(nameOrId: string): RegisteredServerAction | undefined {
  const exact = serverActions.get(nameOrId);
  if (exact) return exact;
  const named = [...serverActions.values()].filter((entry) => entry.contract.name === nameOrId);
  return named.length === 1 ? named[0] : undefined;
}

async function parseActionBody(request: Request, maxBytes: number): Promise<unknown[]> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json' && contentType !== 'application/vnd.vx.action+json') throw new TypeError('Server action body must use application/json or application/vnd.vx.action+json.');
  const contentEncoding = request.headers.get('content-encoding')?.trim().toLowerCase();
  if (contentEncoding && contentEncoding !== 'identity') throw new TypeError('Compressed server action bodies are not accepted.');
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new RangeError('Server action body is too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError('Server action body is too large.');
  const payload: unknown = contentType === 'application/vnd.vx.action+json'
    ? deserializeServerValue(text, { maxSourceBytes: maxBytes, maxDepth: 50, maxNodes: 10_000, maxStringBytes: maxBytes })
    : JSON.parse(text);
  if (!isRecord(payload) || !Array.isArray(payload['args'])) throw new TypeError('Server action payload must contain an args array.');
  assertSafeActionValue(payload['args'], 0, { nodes: 0, maxNodes: 10_000, maxDepth: 50 });
  return payload['args'];
}

function validateArguments(contract: ServerActionContract, args: unknown[]): void {
  const required = contract.parameters.filter((parameter) => !parameter.optional).length;
  if (args.length < required || args.length > contract.parameters.length) {
    throw new TypeError(`Action '${contract.name}' expects ${required === contract.parameters.length ? required : `${required}-${contract.parameters.length}`} arguments.`);
  }
  contract.parameters.forEach((parameter, index) => {
    const value = args[index];
    if (value === undefined && parameter.optional) return;
    if (parameter.type && !matchesVXType(value, parameter.type)) {
      throw new TypeError(`Action argument '${parameter.name}' does not match '${parameter.type}'.`);
    }
  });
}

function validateReturnValue(contract: ServerActionContract, value: unknown): void {
  if (!contract.returnType) return;
  if (!matchesVXType(value, contract.returnType)) {
    throw new TypeError(`Action '${contract.name}' returned a value that does not match '${contract.returnType}'.`);
  }
}

function matchesVXType(value: unknown, type: string): boolean {
  const normalized = type.replace(/\s+/g, '').toLowerCase();
  if (normalized.includes('|')) return normalized.split('|').some((part) => matchesVXType(value, part));
  if (normalized.endsWith('?')) return value == null || matchesVXType(value, normalized.slice(0, -1));
  if (normalized.startsWith('array<') || normalized.endsWith('[]')) return Array.isArray(value);
  if (normalized === 'string') return typeof value === 'string';
  if (normalized === 'int' || normalized === 'i32' || normalized === 'i64') return typeof value === 'number' && Number.isInteger(value);
  if (normalized === 'float' || normalized === 'number' || normalized === 'f32' || normalized === 'f64') return typeof value === 'number' && Number.isFinite(value);
  if (normalized === 'bool' || normalized === 'boolean') return typeof value === 'boolean';
  if (normalized === 'bigint') return typeof value === 'bigint' || (typeof value === 'string' && /^-?\d+$/.test(value));
  if (normalized === 'void' || normalized === 'unit') return value === undefined;
  return value !== undefined;
}

function validateOrigin(request: Request, expectedOrigin: string | undefined, policy: ServerActionCsrfPolicy): Response | undefined {
  if (policy === 'disabled') return undefined;
  const origin = request.headers.get('origin');
  const expected = expectedOrigin ?? new URL(request.url).origin;
  if (!origin || origin !== expected) {
    return jsonResponse(403, { ok: false, error: { code: 'VX_ACTION_ORIGIN', message: 'Request origin is not allowed.' } });
  }
  return undefined;
}

function normalizePublicError(error: unknown): { status: number; code: string; message: string } {
  if (isRecord(error) && error['expose'] === true) {
    const status = typeof error['status'] === 'number' && error['status'] >= 400 && error['status'] <= 599 ? error['status'] : 400;
    return { status, code: typeof error['code'] === 'string' ? error['code'] : 'VX_ACTION_FAILED', message: errorMessage(error) };
  }
  return { status: 500, code: 'VX_ACTION_FAILED', message: 'Server action failed.' };
}

function actionNameFromURL(url: string): string | undefined {
  const pathname = new URL(url).pathname;
  const marker = '/_vx/rpc/';
  const index = pathname.indexOf(marker);
  if (index < 0) return undefined;
  const value = pathname.slice(index + marker.length);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}

function jsonResponse(status: number, payload: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(serializeServerValue(payload), {
    status,
    headers: { 'content-type': 'application/vnd.vx.action+json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders }
  });
}

function cryptoRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}


function normalizeMaximumBodyBytes(value: number | undefined): number {
  const maximum = value ?? 64 * 1024;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1024 * 1024) {
    throw new TypeError('Server action maxBodyBytes must be a positive integer no greater than 1048576.');
  }
  return maximum;
}

function assertSafeActionValue(
  value: unknown,
  depth: number,
  state: { nodes: number; maxNodes: number; maxDepth: number }
): void {
  if (depth > state.maxDepth) throw new RangeError('Server action payload is too deeply nested.');
  state.nodes += 1;
  if (state.nodes > state.maxNodes) throw new RangeError('Server action payload contains too many values.');
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertSafeActionValue(item, depth + 1, state);
    return;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Server action objects must be plain records.');
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new TypeError(`Server action payload contains forbidden key '${key}'.`);
    assertSafeActionValue(item, depth + 1, state);
  }
}

function contractsEqual(left: ServerActionContract, right: ServerActionContract): boolean {
  return left.id === right.id
    && left.name === right.name
    && left.returnType === right.returnType
    && left.authorization === right.authorization
    && left.csrf === right.csrf
    && left.parameters.length === right.parameters.length
    && left.parameters.every((parameter, index) => {
      const candidate = right.parameters[index];
      return Boolean(candidate && parameter.name === candidate.name && parameter.type === candidate.type && parameter.optional === candidate.optional);
    });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
