import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export async function inspectSourcePackageBins(rootDirectory) {
  const violations = [];
  for (const group of ['packages', 'apps']) {
    const groupDirectory = resolve(rootDirectory, group);
    let entries;
    try {
      entries = await readdir(groupDirectory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageDirectory = resolve(groupDirectory, entry.name);
      const manifestPath = resolve(packageDirectory, 'package.json');
      let manifest;
      try {
        manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      } catch {
        continue;
      }
      const bins = normalizeBins(manifest.bin);
      for (const [name, target] of bins) {
        if (!target.startsWith('./')) {
          violations.push(`${relative(rootDirectory, manifestPath)} bin '${name}' must use a package-relative target.`);
          continue;
        }
        const targetPath = resolve(packageDirectory, target);
        const relativeTarget = relative(packageDirectory, targetPath);
        if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
          violations.push(`${relative(rootDirectory, manifestPath)} bin '${name}' escapes its package directory.`);
          continue;
        }
        try {
          const details = await stat(targetPath);
          if (!details.isFile()) throw new Error('not a file');
          const source = await readFile(targetPath, 'utf8');
          if (!source.startsWith('#!/usr/bin/env node')) {
            violations.push(`${relative(rootDirectory, targetPath)} is a package binary without a Node shebang.`);
          }
        } catch {
          violations.push(`${relative(rootDirectory, manifestPath)} bin '${name}' points to missing source file '${target}'.`);
        }
      }
    }
  }
  return violations;
}

function normalizeBins(value) {
  if (typeof value === 'string') return [['default', value]];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).filter((entry) => typeof entry[1] === 'string');
}
