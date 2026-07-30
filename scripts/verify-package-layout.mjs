import { readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(process.cwd());
const manifests = await discoverManifests(root);
const failures = [];
let checked = 0;

for (const manifestPath of manifests) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const base = dirname(manifestPath);
  for (const entry of collectEntries(manifest)) {
    if (!entry.target.startsWith('./') && !entry.target.startsWith('dist/')) continue;
    const path = resolve(base, entry.target);
    try {
      const metadata = await stat(path);
      if (!metadata.isFile()) failures.push(`${relative(root, path)} is not a file (${entry.label}).`);
      else if (entry.executable) await verifyExecutable(path, failures);
      checked++;
    } catch {
      failures.push(`${relative(root, path)} is missing (${entry.label}).`);
    }
  }
}

if (failures.length > 0) {
  console.error('VX package-layout verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`VX package-layout verification passed (${checked} published entrypoints).`);
}

async function discoverManifests(projectRoot) {
  const candidates = [];
  for (const group of ['packages', 'apps']) {
    const directory = join(projectRoot, group);
    const entries = await import('node:fs/promises').then(({ readdir }) => readdir(directory, { withFileTypes: true }));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name, 'package.json');
      try {
        await stat(path);
        candidates.push(path);
      } catch {
        // A workspace directory without a manifest is not a publishable package.
      }
    }
  }
  return candidates.sort();
}

function collectEntries(manifest) {
  const entries = [];
  add(entries, 'main', manifest.main);
  add(entries, 'types', manifest.types);
  if (typeof manifest.bin === 'string') add(entries, 'bin', manifest.bin, true);
  else if (manifest.bin && typeof manifest.bin === 'object') {
    for (const [name, target] of Object.entries(manifest.bin)) add(entries, `bin:${name}`, target, true);
  }
  collectExportEntries(entries, manifest.exports, 'exports');
  return deduplicate(entries);
}

function collectExportEntries(entries, value, label) {
  if (typeof value === 'string') {
    add(entries, label, value);
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) collectExportEntries(entries, child, `${label}:${key}`);
}

function add(entries, label, target, executable = false) {
  if (typeof target === 'string') entries.push({ label, target, executable });
}

function deduplicate(entries) {
  const unique = new Map();
  for (const entry of entries) {
    const key = `${entry.target}:${entry.executable}`;
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()];
}

async function verifyExecutable(path, failures) {
  const source = await readFile(path, 'utf8');
  if (!source.startsWith('#!/usr/bin/env node')) {
    failures.push(`${relative(root, path)} is published as a binary but has no Node shebang.`);
  }
}
