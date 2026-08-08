import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { collectSourceFiles, loadSourcePolicy } from './source-package-policy.mjs';

const root = resolve(import.meta.dirname, '../..');
const version = JSON.parse(readFileSync(resolve(root, 'release/version.json'), 'utf8')).framework;
const outputFlag = process.argv.indexOf('--out');
const outputRoot = outputFlag >= 0 ? resolve(process.argv[outputFlag + 1]) : resolve(root, '..', 'vx-release-artifacts');
const destination = resolve(outputRoot, `vx-${version}-source`);
const policy = loadSourcePolicy(root);
const files = collectSourceFiles(root, policy);

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
const manifest = [];
for (const file of files) {
  const source = resolve(root, file);
  const target = resolve(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { force: true, dereference: false });
  const bytes = readFileSync(source);
  manifest.push({ path: file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
writeFileSync(resolve(destination, 'SOURCE-MANIFEST.json'), `${JSON.stringify({ version: 1, framework: version, files: manifest }, null, 2)}\n`);
console.log(`Created allowlisted VX source package at ${destination} (${files.length} files).`);
