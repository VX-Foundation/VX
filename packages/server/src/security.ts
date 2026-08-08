export interface SecurityHeadersOptions {
  contentSecurityPolicy?: boolean | string;
  crossOriginOpenerPolicy?: false | 'same-origin' | 'same-origin-allow-popups';
  crossOriginResourcePolicy?: false | 'same-origin' | 'same-site' | 'cross-origin';
  referrerPolicy?: string;
  permissionsPolicy?: string;
  strictTransportSecurity?: false | string;
}

export interface CorsOptions {
  origins: readonly string[] | ((origin: string) => boolean);
  methods?: readonly string[];
  headers?: readonly string[];
  exposeHeaders?: readonly string[];
  credentials?: boolean;
  maxAgeSeconds?: number;
}

export function applySecurityHeaders(headers: Headers, options: SecurityHeadersOptions = {}): Headers {
  if (!headers.has('x-content-type-options')) headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('referrer-policy')) headers.set('referrer-policy', options.referrerPolicy ?? 'strict-origin-when-cross-origin');
  if (!headers.has('x-frame-options')) headers.set('x-frame-options', 'DENY');
  if (options.crossOriginOpenerPolicy !== false && !headers.has('cross-origin-opener-policy')) headers.set('cross-origin-opener-policy', options.crossOriginOpenerPolicy ?? 'same-origin');
  if (options.crossOriginResourcePolicy !== false && !headers.has('cross-origin-resource-policy')) headers.set('cross-origin-resource-policy', options.crossOriginResourcePolicy ?? 'same-origin');
  if (options.permissionsPolicy && !headers.has('permissions-policy')) headers.set('permissions-policy', options.permissionsPolicy);
  if (options.strictTransportSecurity !== false && options.strictTransportSecurity && !headers.has('strict-transport-security')) headers.set('strict-transport-security', options.strictTransportSecurity);
  if (options.contentSecurityPolicy !== false && !headers.has('content-security-policy')) {
    headers.set('content-security-policy', typeof options.contentSecurityPolicy === 'string'
      ? options.contentSecurityPolicy
      : "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'");
  }
  return headers;
}

export function applyCors(request: Request, headers: Headers, options: CorsOptions): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  // eslint-disable-next-line no-control-regex
  const sanitizedOrigin = origin.replace(/[\u0000-\u0020\u007f]+/g, '').trim();
  if (!sanitizedOrigin) return false;

  const allowed = typeof options.origins === 'function' ? options.origins(sanitizedOrigin) : options.origins.includes(sanitizedOrigin) || options.origins.includes('*');
  if (!allowed) return false;

  if (typeof options.origins !== 'function' && options.origins.includes('*') && !options.credentials) {
    headers.set('access-control-allow-origin', '*');
  } else {
    headers.set('access-control-allow-origin', sanitizedOrigin);
    headers.append('vary', 'Origin');
  }

  if (options.credentials) headers.set('access-control-allow-credentials', 'true');
  if (options.exposeHeaders?.length) headers.set('access-control-expose-headers', options.exposeHeaders.join(', '));
  if (request.method === 'OPTIONS') {
    headers.set('access-control-allow-methods', (options.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', '));
    const requestedHeaders = request.headers.get('access-control-request-headers');
    headers.set('access-control-allow-headers', options.headers?.join(', ') ?? requestedHeaders ?? 'content-type');
    if (options.maxAgeSeconds !== undefined) headers.set('access-control-max-age', String(Math.max(0, Math.floor(options.maxAgeSeconds))));
  }
  return true;
}
