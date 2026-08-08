import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../packages/language/dist/parser.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedRoots = process.argv.slice(2);
const scanRoots = requestedRoots.length ? requestedRoots : ['packages', 'apps', 'tests'];
const files = [];

for (const requested of scanRoots) {
  const absolute = resolve(root, requested);
  const repositoryRelative = relative(root, absolute);
  if (isAbsolute(repositoryRelative) || repositoryRelative === '..' || repositoryRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Refusing to scan path outside the repository: ${requested}`);
  }
  await collect(absolute, files);
}

let errorCount = 0;
for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  const displayPath = relative(root, file).replaceAll('\\', '/');
  const { diagnostics } = parse(source, displayPath);
  for (const diagnostic of diagnostics) {
    const severity = diagnostic.severity ?? 'error';
    if (severity === 'error') errorCount += 1;
    const location = diagnostic.span?.start
      ? `${displayPath}:${diagnostic.span.start.line}:${diagnostic.span.start.column}`
      : displayPath;
    console.error(`${severity.toUpperCase()} ${diagnostic.code ?? 'VX0000'} ${location} ${diagnostic.message}`);
  }
}

if (errorCount > 0) {
  console.error(`VX source verification failed: ${errorCount} error(s) across ${files.length} file(s).`);
  process.exitCode = 1;
} else {
  console.log(`VX source verification passed: ${files.length} file(s), 0 parser errors.`);
}

async function collect(path, output) {
  let details;
  try {
    details = await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (details.isFile()) {
    if (extname(path) === '.vx') output.push(path);
    return;
  }
  if (!details.isDirectory()) return;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo' || entry.name === '.vx') continue;
    await collect(resolve(path, entry.name), output);
  }
}
