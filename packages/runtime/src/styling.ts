import type { Cleanup } from './dom.js';

export type StyleLayer = 'reset' | 'tokens' | 'base' | 'components' | 'utilities' | 'overrides';
export interface StyleChunk { id: string; cssText: string; layer?: StyleLayer; critical?: boolean; media?: string; container?: string; dependencies?: readonly string[]; }
export interface StyleManifest { chunks: readonly StyleChunk[]; used: readonly string[]; criticalCss: string; deferredCss: string; }

const installed = new WeakMap<Document | ShadowRoot, Map<string, { count: number; node: HTMLStyleElement }>>();

export function scopeCss(cssText: string, scopeId: string): string {
  const selector = `[data-vx-scope="${escapeCss(scopeId)}"]`;
  return cssText.replace(/(^|})\s*([^@}{][^{]*)\{/g, (_match, prefix: string, list: string) => `${prefix}${list.split(',').map((item) => `${selector} ${item.trim()}`).join(',')}{`);
}

export function createCssModule(cssText: string, moduleId: string): { cssText: string; classes: Readonly<Record<string, string>> } {
  const classes: Record<string, string> = {};
  const transformed = cssText.replace(/\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g, (_match, name: string) => {
    const scoped = classes[name] ?? `${name}_${stableHash(`${moduleId}:${name}`).slice(0, 7)}`;
    classes[name] = scoped;
    return `.${scoped}`;
  });
  return { cssText: transformed, classes: Object.freeze(classes) };
}

export function installStyleChunk(root: Document | ShadowRoot, chunk: StyleChunk, nonce?: string): Cleanup {
  let registry = installed.get(root); if (!registry) { registry = new Map(); installed.set(root, registry); }
  const existing = registry.get(chunk.id); if (existing) { existing.count++; return () => release(registry!, chunk.id); }
  const node = (root instanceof Document ? root : root.ownerDocument).createElement('style');
  node.dataset['vxStyle'] = chunk.id; if (nonce) node.nonce = nonce;
  node.textContent = wrapChunk(chunk);
  (root instanceof Document ? root.head : root).appendChild(node);
  registry.set(chunk.id, { count: 1, node });
  return () => release(registry!, chunk.id);
}

export function extractStyles(chunks: readonly StyleChunk[], used: ReadonlySet<string>): StyleManifest {
  const selected = includeDependencies(chunks, used);
  const critical = selected.filter((chunk) => chunk.critical).map(wrapChunk).join('\n');
  const deferred = selected.filter((chunk) => !chunk.critical).map(wrapChunk).join('\n');
  return Object.freeze({ chunks: selected, used: [...used].sort(), criticalCss: critical, deferredCss: deferred });
}

export function eliminateDeadStyles(chunks: readonly StyleChunk[], used: ReadonlySet<string>): readonly StyleChunk[] { return includeDependencies(chunks, used); }
export function splitStyleChunks(chunks: readonly StyleChunk[], routeUsage: Readonly<Record<string, readonly string[]>>): Readonly<Record<string, StyleManifest>> {
  return Object.freeze(Object.fromEntries(Object.entries(routeUsage).map(([route, ids]) => [route, extractStyles(chunks, new Set(ids))])));
}

export function serializeKeyframes(name: string, frames: Readonly<Record<string, Readonly<Record<string, string | number>>>>): string {
  if (!/^[-_a-zA-Z][-_a-zA-Z0-9]*$/.test(name)) throw new TypeError('Invalid keyframe name.');
  return `@keyframes ${name}{${Object.entries(frames).map(([offset, declarations]) => `${offset}{${Object.entries(declarations).map(([property, value]) => `${toKebab(property)}:${String(value)}`).join(';')}}`).join('')}}`;
}

function includeDependencies(chunks: readonly StyleChunk[], used: ReadonlySet<string>): readonly StyleChunk[] {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk])); const selected = new Set<string>();
  const add = (id: string): void => { if (selected.has(id)) return; const chunk = byId.get(id); if (!chunk) return; selected.add(id); chunk.dependencies?.forEach(add); };
  used.forEach(add); return chunks.filter((chunk) => selected.has(chunk.id));
}
function wrapChunk(chunk: StyleChunk): string {
  let css = chunk.cssText; if (chunk.container) css = `@container ${chunk.container}{${css}}`; if (chunk.media) css = `@media ${chunk.media}{${css}}`; if (chunk.layer) css = `@layer vx.${chunk.layer}{${css}}`; return css;
}
function release(registry: Map<string, { count: number; node: HTMLStyleElement }>, id: string): void { const entry = registry.get(id); if (!entry) return; if (--entry.count === 0) { entry.node.remove(); registry.delete(id); } }
function escapeCss(value: string): string { return value.replace(/["\\]/g, '\\$&'); }
function toKebab(value: string): string { return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`); }
function stableHash(value: string): string { let hash = 2166136261; for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
