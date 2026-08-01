import { createHash } from 'node:crypto';
import path from 'node:path';
import type { LibraryBuildConfig } from '@vx-foundation/types';

export type ViteLibraryEntry = string | Readonly<Record<string, string>>;
export type ViteLibraryFileName = string | ((format: string, entryName: string) => string);

/** Converts VX library entries into collision-free aliases for Vite library mode. */
export function normalizeLibraryEntries(root: string, configured: LibraryBuildConfig['entry']): ViteLibraryEntry {
  const entry = configured ?? path.join(root, 'src', 'index.ts');
  if (typeof entry === 'string') return path.resolve(root, entry);
  const aliases = new Map<string, string>();
  const output: Record<string, string> = {};
  for (const source of entry) {
    const absolute = path.resolve(root, source);
    const alias = uniqueEntryAlias(root, absolute, aliases);
    aliases.set(alias.toLowerCase(), absolute);
    output[alias] = absolute;
  }
  return Object.freeze(output);
}

/** Produces unique filenames for multi-entry libraries and preserves Vite defaults for a single entry. */
export function normalizeLibraryFileName(entry: ViteLibraryEntry, configured?: string): ViteLibraryFileName {
  if (typeof entry === 'string') return configured ?? 'index';
  const prefix = configured ? `${stripExtension(configured)}-` : '';
  return (format, entryName) => `${prefix}${safeAlias(entryName)}.${format === 'cjs' ? 'cjs' : 'js'}`;
}

function uniqueEntryAlias(root: string, absolute: string, aliases: ReadonlyMap<string, string>): string {
  const base = safeAlias(path.basename(absolute, path.extname(absolute)));
  if (!aliases.has(base.toLowerCase())) return base;
  const relative = path.relative(root, absolute).replace(/\\/g, '/').replace(/\.[^.]+$/, '');
  const expanded = safeAlias(relative.replace(/^src\//, '').replace(/\//g, '-'));
  if (!aliases.has(expanded.toLowerCase())) return expanded;
  return `${expanded}-${createHash('sha256').update(relative).digest('hex').slice(0, 8)}`;
}

function safeAlias(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'entry';
}

function stripExtension(value: string): string {
  const extension = path.extname(value);
  return extension ? value.slice(0, -extension.length) : value;
}
