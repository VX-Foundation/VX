import type { AssetManifest, AssetRecord, ResourceHint, ResourceHintManifest } from './types.js';

export function createResourceHints(
  manifest: AssetManifest,
  options: { preload: boolean; prefetch: boolean; criticalAssets: readonly string[] }
): ResourceHintManifest {
  const entry: ResourceHint[] = [];
  const deferred: ResourceHint[] = [];
  const critical = new Set(options.criticalAssets.map(normalizePublicPath));
  for (const asset of manifest.assets) {
    const hint = hintFor(asset);
    if (!hint) continue;
    if (options.preload && critical.has(asset.publicPath)) entry.push(hint);
    else if (options.prefetch && isDeferred(asset)) deferred.push({ ...hint, relation: 'prefetch' });
  }
  return Object.freeze({
    version: 1,
    entry: Object.freeze(sortHints(entry)),
    deferred: Object.freeze(sortHints(deferred))
  });
}

export function renderResourceHints(hints: ResourceHintManifest): string {
  return [...hints.entry, ...hints.deferred].map((hint) => {
    const attributes = [
      `rel=${JSON.stringify(hint.relation)}`,
      `href=${JSON.stringify(hint.href)}`,
      hint.as ? `as=${JSON.stringify(hint.as)}` : '',
      hint.type ? `type=${JSON.stringify(hint.type)}` : '',
      hint.crossOrigin ? `crossorigin=${JSON.stringify(hint.crossOrigin)}` : '',
      hint.integrity ? `integrity=${JSON.stringify(hint.integrity)}` : ''
    ].filter(Boolean);
    return `<link ${attributes.join(' ')}>`;
  }).join('\n');
}

function hintFor(asset: AssetRecord): ResourceHint | undefined {
  const as = resourceKind(asset);
  if (!as) return undefined;
  const relation = asset.kind === 'script' ? 'modulepreload' : 'preload';
  return {
    relation,
    href: asset.publicPath,
    as,
    ...(asset.metadata?.mediaType ? { type: asset.metadata.mediaType } : {}),
    ...(asset.kind === 'font' ? { crossOrigin: 'anonymous' as const } : {}),
    ...(asset.integrity ? { integrity: asset.integrity } : {})
  };
}

function resourceKind(asset: AssetRecord): ResourceHint['as'] | undefined {
  if (asset.kind === 'script') return 'script';
  if (asset.kind === 'css') return 'style';
  if (asset.kind === 'font') return 'font';
  if (asset.kind === 'image' || asset.kind === 'svg' || asset.kind === 'icon') return 'image';
  if (asset.kind === 'video') return 'video';
  if (asset.kind === 'audio') return 'audio';
  if (asset.kind === 'worker') return 'worker';
  if (asset.kind === 'wasm') return 'fetch';
  return undefined;
}

function isDeferred(asset: AssetRecord): boolean {
  return asset.kind === 'script' || asset.kind === 'worker' || asset.kind === 'wasm' || asset.kind === 'image';
}
function normalizePublicPath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
function sortHints(hints: ResourceHint[]): ResourceHint[] { return hints.sort((a, b) => a.href.localeCompare(b.href) || a.relation.localeCompare(b.relation)); }
