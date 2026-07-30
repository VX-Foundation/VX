import type { RouteMetadata } from '../types.js';

const MANAGED_ATTRIBUTE = 'data-vx-route-meta';
const documentDefaults = new WeakMap<Document, { title: string; language: string }>();

export function resolveRouteTitle(metadata: RouteMetadata): string | undefined {
  if (!metadata.title) return undefined;
  if (!metadata.titleTemplate) return metadata.title;
  return metadata.titleTemplate.includes('%s')
    ? metadata.titleTemplate.replace(/%s/g, metadata.title)
    : `${metadata.title} ${metadata.titleTemplate}`;
}

export function applyRouteMetadata(metadata: RouteMetadata, documentTarget: Document = document): void {
  let defaults = documentDefaults.get(documentTarget);
  if (!defaults) {
    defaults = { title: documentTarget.title, language: documentTarget.documentElement.lang };
    documentDefaults.set(documentTarget, defaults);
  }
  const title = resolveRouteTitle(metadata);
  documentTarget.title = title ?? defaults.title;
  documentTarget.documentElement.lang = metadata.language ?? defaults.language;
  setNamedMeta(documentTarget, 'description', metadata.description);
  setNamedMeta(documentTarget, 'robots', metadata.robots);
  setCanonical(documentTarget, metadata.canonical);

  const openGraph = { ...metadata.openGraph };
  if (metadata.image && !openGraph.images) openGraph.images = [metadata.image];
  setPropertyMeta(documentTarget, 'og:title', openGraph.title ?? title);
  setPropertyMeta(documentTarget, 'og:description', openGraph.description ?? metadata.description);
  setPropertyMeta(documentTarget, 'og:type', openGraph.type);
  setPropertyMeta(documentTarget, 'og:url', openGraph.url ?? metadata.canonical);
  setPropertyMeta(documentTarget, 'og:site_name', openGraph.siteName);
  setPropertyMeta(documentTarget, 'og:locale', openGraph.locale);
  setPropertyMetaList(documentTarget, 'og:image', openGraph.images ?? []);

  setNamedMeta(documentTarget, 'twitter:card', metadata.twitter?.card);
  setNamedMeta(documentTarget, 'twitter:site', metadata.twitter?.site);
  setNamedMeta(documentTarget, 'twitter:creator', metadata.twitter?.creator);
  setNamedMeta(documentTarget, 'twitter:title', metadata.twitter?.title ?? title);
  setNamedMeta(documentTarget, 'twitter:description', metadata.twitter?.description ?? metadata.description);
  setNamedMetaList(documentTarget, 'twitter:image', metadata.twitter?.images ?? []);
  setAlternates(documentTarget, metadata.alternates ?? []);
  setStructuredData(documentTarget, metadata.structuredData);

  const custom = metadata.custom ?? {};
  const retained = new Set<string>();
  for (const [name, content] of Object.entries(custom)) {
    retained.add(name);
    setNamedMeta(documentTarget, name, content, true);
  }
  for (const node of documentTarget.head.querySelectorAll<HTMLMetaElement>(`meta[${MANAGED_ATTRIBUTE}="custom"]`)) {
    const name = node.getAttribute('name');
    if (name && !retained.has(name)) node.remove();
  }
}

export function renderRouteMetadata(metadata: RouteMetadata): string {
  const title = resolveRouteTitle(metadata);
  const pieces: string[] = [];
  if (metadata.description) pieces.push(metaName('description', metadata.description));
  if (metadata.robots) pieces.push(metaName('robots', metadata.robots));
  if (metadata.canonical) pieces.push(`<link rel="canonical" href="${escapeAttribute(metadata.canonical)}">`);
  for (const alternate of metadata.alternates ?? []) pieces.push(`<link rel="alternate" hreflang="${escapeAttribute(alternate.language)}" href="${escapeAttribute(alternate.href)}">`);

  const openGraph = { ...metadata.openGraph };
  if (metadata.image && !openGraph.images) openGraph.images = [metadata.image];
  pushProperty(pieces, 'og:title', openGraph.title ?? title);
  pushProperty(pieces, 'og:description', openGraph.description ?? metadata.description);
  pushProperty(pieces, 'og:type', openGraph.type);
  pushProperty(pieces, 'og:url', openGraph.url ?? metadata.canonical);
  pushProperty(pieces, 'og:site_name', openGraph.siteName);
  pushProperty(pieces, 'og:locale', openGraph.locale);
  for (const image of openGraph.images ?? []) pushProperty(pieces, 'og:image', image);

  pushName(pieces, 'twitter:card', metadata.twitter?.card);
  pushName(pieces, 'twitter:site', metadata.twitter?.site);
  pushName(pieces, 'twitter:creator', metadata.twitter?.creator);
  pushName(pieces, 'twitter:title', metadata.twitter?.title ?? title);
  pushName(pieces, 'twitter:description', metadata.twitter?.description ?? metadata.description);
  for (const image of metadata.twitter?.images ?? []) pushName(pieces, 'twitter:image', image);
  for (const [name, content] of Object.entries(metadata.custom ?? {})) pushName(pieces, name, content);

  const structured = metadata.structuredData === undefined
    ? []
    : Array.isArray(metadata.structuredData) ? metadata.structuredData : [metadata.structuredData];
  for (const value of structured) pieces.push(`<script type="application/ld+json">${safeJson(value)}</script>`);
  return pieces.join('');
}

function setNamedMeta(documentTarget: Document, name: string, content: string | undefined, custom = false): void {
  const selector = `meta[name="${escapeSelector(name)}"]`;
  let node = documentTarget.head.querySelector<HTMLMetaElement>(selector);
  if (content === undefined) {
    if (node?.hasAttribute(MANAGED_ATTRIBUTE)) node.remove();
    return;
  }
  if (!node) {
    node = documentTarget.createElement('meta');
    node.name = name;
    documentTarget.head.appendChild(node);
  }
  node.content = content;
  node.setAttribute(MANAGED_ATTRIBUTE, custom ? 'custom' : 'standard');
}

function setNamedMetaList(documentTarget: Document, name: string, values: readonly string[]): void {
  setMetaList(documentTarget, `meta[name="${escapeSelector(name)}"]`, values, (node, value) => {
    node.setAttribute('name', name);
    node.setAttribute('content', value);
  });
}

function setPropertyMeta(documentTarget: Document, property: string, content: string | undefined): void {
  let node = documentTarget.head.querySelector<HTMLMetaElement>(`meta[property="${escapeSelector(property)}"]`);
  if (content === undefined) {
    if (node?.hasAttribute(MANAGED_ATTRIBUTE)) node.remove();
    return;
  }
  if (!node) {
    node = documentTarget.createElement('meta');
    node.setAttribute('property', property);
    documentTarget.head.appendChild(node);
  }
  node.content = content;
  node.setAttribute(MANAGED_ATTRIBUTE, 'standard');
}

function setPropertyMetaList(documentTarget: Document, property: string, values: readonly string[]): void {
  setMetaList(documentTarget, `meta[property="${escapeSelector(property)}"]`, values, (node, value) => {
    node.setAttribute('property', property);
    node.setAttribute('content', value);
  });
}

function setMetaList(
  documentTarget: Document,
  selector: string,
  values: readonly string[],
  configure: (node: HTMLMetaElement, value: string) => void
): void {
  const existing = [...documentTarget.head.querySelectorAll<HTMLMetaElement>(selector)].filter((node) => node.hasAttribute(MANAGED_ATTRIBUTE));
  values.forEach((value, index) => {
    const node = existing[index] ?? documentTarget.createElement('meta');
    configure(node, value);
    node.setAttribute(MANAGED_ATTRIBUTE, 'list');
    if (!node.parentNode) documentTarget.head.appendChild(node);
  });
  existing.slice(values.length).forEach((node) => node.remove());
}

function setCanonical(documentTarget: Document, href: string | undefined): void {
  let node = documentTarget.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === undefined) {
    if (node?.hasAttribute(MANAGED_ATTRIBUTE)) node.remove();
    return;
  }
  if (!node) {
    node = documentTarget.createElement('link');
    node.rel = 'canonical';
    documentTarget.head.appendChild(node);
  }
  node.href = href;
  node.setAttribute(MANAGED_ATTRIBUTE, 'standard');
}

function setAlternates(documentTarget: Document, alternates: readonly { language: string; href: string }[]): void {
  const existing = [...documentTarget.head.querySelectorAll<HTMLLinkElement>(`link[rel="alternate"][${MANAGED_ATTRIBUTE}="alternate"]`)];
  alternates.forEach((alternate, index) => {
    const node = existing[index] ?? documentTarget.createElement('link');
    node.rel = 'alternate';
    node.hreflang = alternate.language;
    node.href = alternate.href;
    node.setAttribute(MANAGED_ATTRIBUTE, 'alternate');
    if (!node.parentNode) documentTarget.head.appendChild(node);
  });
  existing.slice(alternates.length).forEach((node) => node.remove());
}

function setStructuredData(documentTarget: Document, value: RouteMetadata['structuredData']): void {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const existing = [...documentTarget.head.querySelectorAll<HTMLScriptElement>(`script[type="application/ld+json"][${MANAGED_ATTRIBUTE}="structured"]`)];
  values.forEach((entry, index) => {
    const node = existing[index] ?? documentTarget.createElement('script');
    node.type = 'application/ld+json';
    node.textContent = safeJson(entry);
    node.setAttribute(MANAGED_ATTRIBUTE, 'structured');
    if (!node.parentNode) documentTarget.head.appendChild(node);
  });
  existing.slice(values.length).forEach((node) => node.remove());
}

function metaName(name: string, content: string): string {
  return `<meta name="${escapeAttribute(name)}" content="${escapeAttribute(content)}">`;
}
function pushName(pieces: string[], name: string, content: string | undefined): void { if (content !== undefined) pieces.push(metaName(name, content)); }
function pushProperty(pieces: string[], property: string, content: string | undefined): void { if (content !== undefined) pieces.push(`<meta property="${escapeAttribute(property)}" content="${escapeAttribute(content)}">`); }
function safeJson(value: unknown): string { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }
function escapeSelector(value: string): string { return value.replace(/["\\]/g, '\\$&'); }
function escapeAttribute(value: string): string { return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
