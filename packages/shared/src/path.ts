import path from 'node:path';

export function normalizeToPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

export function resolveFromRoot(root: string, ...segments: string[]): string {
  return path.resolve(root, ...segments);
}

export function toProjectRelativePath(root: string, filePath: string): string {
  const relativePath = path.relative(root, filePath);

  return normalizeToPosixPath(relativePath.length > 0 ? relativePath : '.');
}

export function ensureLeadingDotSlash(relativePath: string): string {
  if (relativePath === '.' || relativePath === './') {
    return './';
  }

  if (relativePath.startsWith('./') || relativePath.startsWith('../')) {
    return relativePath;
  }

  return `./${relativePath}`;
}
