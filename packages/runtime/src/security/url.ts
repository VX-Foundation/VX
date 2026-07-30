const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite']);
const EXECUTABLE_PROTOCOLS = new Set(['javascript:', 'vbscript:', 'file:']);
const NETWORK_PROTOCOLS = new Set(['http:', 'https:']);
const LINK_PROTOCOLS = new Set(['mailto:', 'tel:', 'sms:']);
const MEDIA_TAGS = new Set(['img', 'audio', 'video', 'source', 'track']);
const SAFE_IMAGE_DATA = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i;

export interface URLSanitizationContext {
  attribute: string;
  tagName?: string;
}

/** Returns a browser-safe URL or undefined when the value uses an executable or unsupported scheme. */
export function sanitizeURLAttribute(value: unknown, context: URLSanitizationContext): string | undefined {
  const attribute = context.attribute.toLowerCase();
  if (!URL_ATTRIBUTES.has(attribute)) return value == null ? undefined : String(value);
  if (value === undefined || value === null || value === false) return undefined;

  const source = String(value).trim();
  if (!source) return '';
  // eslint-disable-next-line no-control-regex
  const normalizedForScheme = source.replace(/[\u0000-\u0020\u007f]+/g, '');
  const schemeMatch = /^([a-z][a-z0-9+.-]*:)/i.exec(normalizedForScheme);
  if (!schemeMatch) return source;

  const scheme = schemeMatch[1]!.toLowerCase();
  if (EXECUTABLE_PROTOCOLS.has(scheme)) return undefined;
  if (NETWORK_PROTOCOLS.has(scheme)) return source;
  if (scheme === 'blob:') return MEDIA_TAGS.has(context.tagName?.toLowerCase() ?? '') ? source : undefined;
  if (scheme === 'data:') {
    return context.tagName?.toLowerCase() === 'img' && SAFE_IMAGE_DATA.test(source) ? source : undefined;
  }
  if (attribute === 'href' && LINK_PROTOCOLS.has(scheme)) return source;
  return undefined;
}

export function isURLAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name.toLowerCase());
}

export function secureExternalRelation(value: unknown): string {
  const relations = new Set(String(value ?? '').split(/\s+/).map((item) => item.toLowerCase()).filter(Boolean));
  relations.add('noopener');
  relations.add('noreferrer');
  return [...relations].sort().join(' ');
}
