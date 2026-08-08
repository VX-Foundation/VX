function getNodePath() {
  try {
    const modName = ['node', 'path'].join(':');
    const getReq = new Function('m', 'return typeof require !== "undefined" ? require(m) : null');
    return typeof process !== 'undefined' && process.versions?.node ? getReq(modName) : null;
  } catch {
    return null;
  }
}

export function normalizeToPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

export function resolveFromRoot(root: string, ...segments: string[]): string {
  const nodePath = getNodePath();
  if (nodePath) {
    return nodePath.resolve(root, ...segments);
  }
  const joined = [root, ...segments].join('/');
  return normalizeToPosixPath(joined);
}

export function toProjectRelativePath(root: string, filePath: string): string {
  const nodePath = getNodePath();
  if (nodePath) {
    const relativePath = nodePath.relative(root, filePath);
    return normalizeToPosixPath(relativePath.length > 0 ? relativePath : '.');
  }
  const normRoot = normalizeToPosixPath(root).replace(/\/$/, '');
  const normFile = normalizeToPosixPath(filePath);
  if (normFile.startsWith(`${normRoot}/`)) {
    return normFile.slice(normRoot.length + 1);
  }
  return normFile;
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
