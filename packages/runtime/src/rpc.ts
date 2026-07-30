import { deserializeServerValue, serializeServerValue } from './server-platform/serialization.js';
export interface ServerActionResponse<T = unknown> {
  ok: boolean;
  value?: T;
  error?: { message: string; code?: string };
}

export function createServerAction<TArgs extends unknown[], TResult>(name: string) {
  return async (...args: TArgs): Promise<TResult> => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="vx-csrf"]')?.content;
    const response = await fetch(`/_vx/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/vnd.vx.action+json',
        'x-vx-route': window.location.pathname,
        ...(token ? { 'x-vx-csrf': token } : {})
      },
      body: serializeServerValue({ args })
    });

    const payload = deserializeServerValue(await response.text()) as ServerActionResponse<TResult>;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message ?? `Server action '${name}' failed with status ${response.status}.`);
    }
    return payload.value as TResult;
  };
}
