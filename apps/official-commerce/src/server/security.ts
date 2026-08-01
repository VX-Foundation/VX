import { env, readServerEnvironment } from '@vx-foundation/server';
import { verifyCsrfToken } from '@vx-foundation/runtime/server';

export async function verifyCommerceCsrf(request: Request, token: string | undefined, source: Record<string, string | undefined> = process.env): Promise<boolean> {
  const binding = request.headers.get('x-demo-user')?.trim();
  if (!binding || !token) return false;
  const configuration = readServerEnvironment({
    COMMERCE_CSRF_SECRET: { parse: env.string({ minLength: 32 }), secret: true }
  }, source);
  return verifyCsrfToken(token, { secret: configuration.COMMERCE_CSRF_SECRET, binding });
}
