import { applySecurityHeaders } from '@vx-foundation/server/security';

export function GET(): Response {
  const headers = applySecurityHeaders(new Headers({ 'content-type': 'application/json; charset=utf-8' }));
  return new Response(JSON.stringify({ status: 'ok', application: 'official-dashboard' }), { headers });
}
