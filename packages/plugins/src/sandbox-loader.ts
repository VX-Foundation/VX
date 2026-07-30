import { builtinModules } from 'node:module';
import { resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const internalRoot = process.env['VX_PLUGIN_INTERNAL_ROOT'] ? resolvePath(process.env['VX_PLUGIN_INTERNAL_ROOT']) : '';
const allowedRoots = parseAllowedRoots(process.env['VX_PLUGIN_ALLOWED_ROOTS']);
const allowedFiles = parseAllowedFiles(process.env['VX_PLUGIN_ALLOWED_FILES']);
const sensitive = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const safeBuiltins = new Set([
  'assert', 'node:assert', 'assert/strict', 'node:assert/strict',
  'buffer', 'node:buffer', 'events', 'node:events',
  'path', 'node:path', 'path/posix', 'node:path/posix', 'path/win32', 'node:path/win32',
  'querystring', 'node:querystring', 'string_decoder', 'node:string_decoder',
  'url', 'node:url', 'util', 'node:util'
]);

export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (specifier: string, context: unknown) => Promise<unknown>
): Promise<unknown> {
  if (/^(?:https?|data):/i.test(specifier)) throw new Error(`VX plugin sandbox blocked remote module '${specifier}'.`);
  if (sensitive.has(specifier)) {
    const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : '';
    if (!within(parent, internalRoot) && !safeBuiltins.has(specifier)) {
      throw new Error(`VX plugin sandbox blocked sensitive module '${specifier}'. Use the capability-mediated plugin API instead.`);
    }
  }
  const result = await nextResolve(specifier, context);
  const url = resolvedUrl(result);
  if (url?.startsWith('file:')) {
    const target = resolvePath(fileURLToPath(url));
    if (!allowedFiles.has(target) && !allowedRoots.some((root) => within(target, root))) {
      throw new Error(`VX plugin sandbox blocked file module '${target}' outside the plugin dependency graph.`);
    }
  }
  return result;
}

function parseAllowedRoots(value: string | undefined): string[] {
  if (!value) return internalRoot ? [resolvePath(internalRoot)] : [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) throw new TypeError('Invalid roots.');
    return [...new Set([internalRoot, ...parsed].filter(Boolean).map((item) => resolvePath(item)))];
  } catch {
    throw new Error('VX plugin sandbox received invalid allowed module roots.');
  }
}

function parseAllowedFiles(value: string | undefined): Set<string> {
  if (!value) return new Set();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) throw new TypeError('Invalid files.');
    return new Set(parsed.map((item) => resolvePath(item)));
  } catch {
    throw new Error('VX plugin sandbox received invalid allowed module files.');
  }
}

function resolvedUrl(value: unknown): string | undefined {
  return value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
    ? (value as { url: string }).url
    : undefined;
}
function within(path: string, root: string): boolean { return Boolean(root) && (path === root || path.startsWith(`${root}${sep}`)); }
