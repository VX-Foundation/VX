import fs from 'node:fs';
import path from 'node:path';

export function deploymentDirectory(outDir: string, name: string): string {
  const directory = path.join(outDir, 'deploy', name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function writeDeploymentFile(directory: string, relativePath: string, content: string | Uint8Array): string {
  const filePath = path.resolve(directory, relativePath);
  if (!filePath.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error(`Unsafe deployment path '${relativePath}'.`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function relativeImport(fromDirectory: string, target: string): string {
  let relative = path.relative(fromDirectory, target).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return relative;
}

export function requireEntry(value: string | undefined, label: string): string {
  if (!value || !fs.existsSync(value)) throw new Error(`${label} requires a compiled ${label.includes('edge') ? 'edge' : 'server'} entry.`);
  return value;
}

export function copyDirectory(source: string, destination: string): string[] {
  if (!fs.existsSync(source)) return [];
  const written: string[] = [];
  const stack: Array<[string, string]> = [[source, destination]];
  while (stack.length) {
    const [currentSource, currentDestination] = stack.pop()!;
    fs.mkdirSync(currentDestination, { recursive: true });
    for (const entry of fs.readdirSync(currentSource, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const sourcePath = path.join(currentSource, entry.name), destinationPath = path.join(currentDestination, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Deployment copy refuses symbolic link '${sourcePath}'.`);
      if (entry.isDirectory()) stack.push([sourcePath, destinationPath]);
      else if (entry.isFile()) { fs.copyFileSync(sourcePath, destinationPath); written.push(destinationPath); }
    }
  }
  return written.sort();
}
