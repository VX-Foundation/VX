import { basename, dirname, extname, relative, sep } from 'node:path';

/**
 * Conventional public surfaces keep package authoring configuration-free while
 * preserving a closed-by-default package boundary. Internal implementation
 * files may still be imported by public entries, but cannot be imported by a
 * package consumer.
 */
export const VX_PUBLIC_SOURCE_DIRECTORIES = Object.freeze([
  'public',
  'components',
  'modules',
  'stores',
  'queries',
  'actions',
  'design-system'
]);

export const VX_PRIVATE_SEGMENTS = new Set(['internal', 'private', '__tests__', 'test', 'tests']);

export function isPrivatePackagePath(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  return segments.some((segment) =>
    VX_PRIVATE_SEGMENTS.has(segment.toLowerCase()) ||
    segment.startsWith('_') ||
    segment.startsWith('.')
  );
}

export function publicExportKey(publicRoot: string, absoluteFile: string): string | undefined {
  const relativeFile = relative(publicRoot, absoluteFile);
  if (relativeFile === '' || relativeFile.startsWith(`..${sep}`) || relativeFile === '..') return undefined;
  if (extname(relativeFile).toLowerCase() !== '.vx' || isPrivatePackagePath(relativeFile)) return undefined;

  const withoutExtension = relativeFile.slice(0, -3);
  const fileName = basename(withoutExtension);
  const parent = dirname(withoutExtension);
  const logicalPath = fileName.toLowerCase() === 'index'
    ? parent === '.' ? '' : parent
    : parent === '.' ? fileName : `${parent}/${fileName}`;
  if (!logicalPath) return undefined;

  const normalized = logicalPath
    .split(/[\\/]+/)
    .map(toKebabCase)
    .filter(Boolean)
    .join('/');
  return normalized ? `./${normalized}` : undefined;
}

export function rootExportKey(sourceDir: string, absoluteFile: string): string | undefined {
  const relativeFile = relative(sourceDir, absoluteFile).replaceAll('\\', '/');
  return relativeFile === 'index.vx' ? '.' : undefined;
}

function toKebabCase(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
