import { json, parseRequestBody } from '@vx/server';
import { authenticateDashboardCredentials, dashboardSessionManagerFromEnvironment } from '../../../server/auth.js';

export async function POST(request: Request): Promise<Response> {
  const credentials = await credentialsFromRequest(request);
  if (!credentials) return json({ ok: false, error: 'Invalid credentials.' }, { status: 400 });
  const principal = authenticateDashboardCredentials(credentials.email, credentials.password);
  if (!principal) return json({ ok: false, error: 'Invalid credentials.' }, { status: 401 });

  const manager = dashboardSessionManagerFromEnvironment();
  const resolved = await manager.resolve(request);
  resolved.session.principal = principal;
  resolved.session.set('tenantId', 'official-dashboard');
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
  await resolved.commit(headers);
  return new Response(null, { status: 303, headers });
}

export async function DELETE(request: Request): Promise<Response> {
  const headers = new Headers({ 'cache-control': 'no-store' });
  await dashboardSessionManagerFromEnvironment().destroy(request, headers);
  return new Response(null, { status: 204, headers });
}

async function credentialsFromRequest(request: Request): Promise<{ email: string; password: string } | undefined> {
  const body = await parseRequestBody(request, { maxBytes: 16_384, maxFields: 8, maxDepth: 4 });
  if (body.type === 'urlencoded') return pair(body.value.get('email'), body.value.get('password'));
  if (body.type === 'multipart') return pair(body.value.get('email'), body.value.get('password'));
  if (body.type === 'json' && body.value && typeof body.value === 'object') {
    const value = body.value as Record<string, unknown>;
    return pair(value['email'], value['password']);
  }
  return undefined;
}

function pair(email: unknown, password: unknown): { email: string; password: string } | undefined {
  return typeof email === 'string' && typeof password === 'string' && email.length <= 320 && password.length <= 1024
    ? { email, password }
    : undefined;
}
