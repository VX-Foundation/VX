import type { ServerMiddleware, ServerPrincipal, ServerRequestContext } from './types.js';

export interface AuthorizationPolicy {
  authenticated?: boolean;
  roles?: readonly string[];
  permissions?: readonly string[];
  mode?: 'all' | 'any';
  predicate?: (principal: ServerPrincipal, context: ServerRequestContext) => boolean | Promise<boolean>;
}

export async function authorizeServerRequest(context: ServerRequestContext, policy: AuthorizationPolicy): Promise<boolean> {
  const principal = context.session?.principal;
  if (policy.authenticated !== false && !principal) return false;
  if (!principal) return policy.authenticated === false && !policy.roles?.length && !policy.permissions?.length && !policy.predicate;
  const mode = policy.mode ?? 'all';
  const roleMatches = policy.roles?.map((role) => principal.roles?.includes(role) === true) ?? [];
  const permissionMatches = policy.permissions?.map((permission) => principal.permissions?.includes(permission) === true) ?? [];
  const checks = [...roleMatches, ...permissionMatches];
  if (checks.length && (mode === 'all' ? checks.some((value) => !value) : checks.every((value) => !value))) return false;
  return policy.predicate ? policy.predicate(principal, context) : true;
}

export function requireAuthorization(policy: AuthorizationPolicy): ServerMiddleware {
  return async (context, next) => {
    if (await authorizeServerRequest(context, policy)) return next();
    return new Response(JSON.stringify({ ok: false, error: { code: 'VX_SERVER_FORBIDDEN', message: 'The request is not authorized.' } }), {
      status: context.session?.principal ? 403 : 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  };
}
