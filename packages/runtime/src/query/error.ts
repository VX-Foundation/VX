import type { QueryError } from './types.js';

export function normalizeQueryError(error: unknown): QueryError {
  if (isQueryError(error)) return error;
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; retryable?: unknown };
    return {
      name: error.name,
      message: error.message,
      retryable: typeof withCode.retryable === 'boolean' ? withCode.retryable : true,
      ...(typeof withCode.code === 'string' ? { code: withCode.code } : {}),
      cause: error
    };
  }
  return {
    name: 'QueryError',
    message: typeof error === 'string' ? error : 'The query failed with an unknown error.',
    retryable: true,
    cause: error
  };
}

function isQueryError(value: unknown): value is QueryError {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record['name'] === 'string' && typeof record['message'] === 'string' && typeof record['retryable'] === 'boolean';
}
