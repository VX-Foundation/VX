import type { ActionError } from './types.js';

export function normalizeActionError(error: unknown): ActionError {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(typeof code === 'string' ? { code } : {}),
      cause: error
    };
  }
  return {
    name: 'ActionError',
    message: typeof error === 'string' ? error : 'The action failed with an unknown error.',
    cause: error
  };
}
