import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const definitions = JSON.parse(readFileSync(resolve(root, 'frameworks.json'), 'utf8'));
const requested = process.argv.slice(2).filter((value) => !value.startsWith('-'));
const names = requested.length ? requested : Object.keys(definitions);
for (const name of names) {
  const definition = definitions[name];
  if (!definition) throw new Error(`Unknown framework '${name}'.`);
  const directory = resolve(root, definition.directory);
  const templatePath = resolve(directory, 'package.template.json');
  if (!existsSync(templatePath)) throw new Error(`Missing benchmark fixture template for '${name}'.`);
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  for (const [dependency, version] of Object.entries({ ...(template.dependencies ?? {}), ...(template.devDependencies ?? {}) })) {
    if (version !== '$stable') continue;
    const resolved = execFileSync('npm', ['view', dependency, 'version', '--json'], { encoding: 'utf8' }).trim().replace(/^"|"$/gu, '');
    if (template.dependencies?.[dependency] === '$stable') template.dependencies[dependency] = resolved;
    if (template.devDependencies?.[dependency] === '$stable') template.devDependencies[dependency] = resolved;
  }
  writeFileSync(resolve(directory, 'package.json'), `${JSON.stringify(template, null, 2)}
`);
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--fund=false', '--audit=false'], { cwd: directory, stdio: 'inherit' });
  execFileSync('npm', ['ci', '--ignore-scripts', '--fund=false', '--audit=false'], { cwd: directory, stdio: 'inherit' });
  const lock = readFileSync(resolve(directory, 'package-lock.json'));
  const record = { framework: name, package: definition.package, version: JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')).dependencies?.[definition.package] ?? JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8')).devDependencies?.[definition.package], lockfileIntegrity: `sha512-${createHash('sha512').update(lock).digest('base64')}` };
  const output = resolve(root, 'locks', `${name}.json`); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(record, null, 2)}
`);
}
