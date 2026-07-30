import fs from 'node:fs';
import path from 'node:path';

export interface DeploymentBootstrap {
  clientEntry: string;
  clientEntryIntegrity?: string;
  styleAssets?: readonly Readonly<{ href: string; integrity?: string; crossOrigin?: 'anonymous' }>[];
  resourceHints?: readonly Readonly<Record<string, unknown>>[];
}

export function readDeploymentBootstrap(clientDir: string, clientEntry = '/assets/vx-client.js'): DeploymentBootstrap {
  const assets = readJson(path.join(clientDir, 'vx.assets.json'));
  const hints = readJson(path.join(clientDir, 'vx.hints.json'));
  const assetRecords = Array.isArray(assets?.['assets']) ? assets['assets'].filter(isRecord) : [];
  const entry = assetRecords.find((record) => record['publicPath'] === clientEntry);
  const entryHints = Array.isArray(hints?.['entry']) ? hints['entry'].filter(isRecord).map((hint) => Object.freeze({ ...hint })) : [];
  const styleAssets = assetRecords
    .filter((record) => record['kind'] === 'css' && record['critical'] === true && typeof record['publicPath'] === 'string')
    .map((record) => Object.freeze({
      href: String(record['publicPath']),
      ...(typeof record['integrity'] === 'string' ? { integrity: record['integrity'] } : {}),
      ...(typeof record['integrity'] === 'string' ? { crossOrigin: 'anonymous' as const } : {})
    }))
    .sort((a, b) => a.href.localeCompare(b.href));
  return Object.freeze({
    clientEntry,
    ...(typeof entry?.['integrity'] === 'string' ? { clientEntryIntegrity: entry['integrity'] } : {}),
    ...(styleAssets.length ? { styleAssets: Object.freeze(styleAssets) } : {}),
    ...(entryHints.length ? { resourceHints: Object.freeze(entryHints) } : {})
  });
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try { const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8')); return isRecord(value) ? value : undefined; }
  catch { return undefined; }
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
