import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(extensionRoot, '..', 'language-server', 'dist');
const target = resolve(extensionRoot, 'server');
try {
  const metadata = await stat(resolve(source, 'server.js'));
  if (!metadata.isFile()) throw new Error('server.js is not a file');
} catch {
  throw new Error('Build @vx/language-server before staging the VS Code extension.');
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await copyFile(resolve(source, 'server.js'), resolve(target, 'server.js'));
try {
  await copyFile(resolve(source, 'server.js.map'), resolve(target, 'server.js.map'));
} catch {
  // Source maps are optional in production staging.
}
await writeFile(resolve(target, 'package.json'), '{"type":"module"}\n', 'utf8');
console.log('Staged VX Language Server inside the VS Code extension.');
