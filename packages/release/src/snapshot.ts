import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import type { PublicPackageSnapshot, PublicSymbolSnapshot, WorkspaceApiSnapshot } from './types.js';

export interface CreateWorkspaceSnapshotOptions {
  groups?: readonly string[];
  includePrivate?: boolean;
}

export function createWorkspaceApiSnapshot(rootDir: string, options: CreateWorkspaceSnapshotOptions = {}): WorkspaceApiSnapshot {
  const packages = [join(rootDir, 'package.json'), ...discoverPackageManifests(rootDir, options.groups ?? ['packages', 'apps'])]
    .map((path) => snapshotPackage(path, options.includePrivate ?? false))
    .filter((value): value is PublicPackageSnapshot => Boolean(value))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { schema: 'https://vx.dev/schemas/public-api-snapshot/v1', version: 1, packages };
}

export function snapshotPackage(packageJsonPath: string, includePrivate = false): PublicPackageSnapshot | undefined {
  const manifest = readObject(packageJsonPath);
  if (manifest['private'] === true && !includePrivate) return undefined;
  const name = manifest['name'];
  const version = manifest['version'];
  if (typeof name !== 'string' || typeof version !== 'string') throw new TypeError(`Package manifest '${packageJsonPath}' requires name and version.`);
  const root = dirname(packageJsonPath);
  const entrypoints = collectTypeEntrypoints(manifest).map(({ subpath, target }) => {
    const path = resolve(root, target);
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Published type entry '${target}' is missing for '${name}'.`);
    return { subpath, typesPath: normalizePath(relative(root, path)), symbols: collectPublicSymbols(path) };
  }).sort((left, right) => left.subpath.localeCompare(right.subpath));
  return {
    name,
    version,
    peerDependencies: toStringRecord(manifest['peerDependencies']),
    entrypoints
  };
}

export function collectPublicSymbols(entryPath: string): PublicSymbolSnapshot[] {
  const symbols = new Map<string, PublicSymbolSnapshot>();
  const visited = new Set<string>();
  collectFile(resolve(entryPath), symbols, visited, undefined);
  return [...symbols.values()].sort((left, right) => left.name.localeCompare(right.name) || left.kind.localeCompare(right.kind));
}

function collectFile(path: string, output: Map<string, PublicSymbolSnapshot>, visited: Set<string>, aliases: ReadonlyMap<string, string> | undefined): void {
  if (visited.has(path)) return;
  visited.add(path);
  const sourceText = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : undefined;
      const modulePath = specifier?.startsWith('.') ? resolveDeclarationModule(path, specifier) : undefined;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        if (modulePath) {
          const map = new Map(statement.exportClause.elements.map((element) => [element.propertyName?.text ?? element.name.text, element.name.text]));
          collectFile(modulePath, output, visited, map);
        } else if (specifier) {
          for (const element of statement.exportClause.elements) {
            addSymbol(output, element.name.text, 'reexport', `${specifier}:${element.propertyName?.text ?? element.name.text}`);
          }
        } else {
          for (const element of statement.exportClause.elements) {
            const exported = element.name.text;
            const local = element.propertyName?.text ?? exported;
            const declaration = findDeclaration(source, local);
            if (declaration) addSymbol(output, exported, declarationKind(declaration), printer.printNode(ts.EmitHint.Unspecified, declaration, source));
          }
        }
      } else if (modulePath) {
        collectFile(modulePath, output, visited, undefined);
      } else if (specifier) {
        addSymbol(output, `*:${specifier}`, 'reexport-all', specifier);
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      addSymbol(output, aliases?.get('default') ?? 'default', 'default', printer.printNode(ts.EmitHint.Unspecified, statement, source));
      continue;
    }

    if (!hasExportModifier(statement)) continue;
    for (const name of declarationNames(statement)) {
      const exported = aliases?.get(name) ?? name;
      if (aliases && !aliases.has(name)) continue;
      addSymbol(output, exported, declarationKind(statement), printer.printNode(ts.EmitHint.Unspecified, statement, source));
    }
  }
}

function addSymbol(output: Map<string, PublicSymbolSnapshot>, name: string, kind: string, declaration: string): void {
  const normalized = declaration.replace(/\s+/g, ' ').trim();
  const key = `${kind}:${name}`;
  output.set(key, { name, kind, hash: createHash('sha256').update(normalized).digest('hex') });
}

function collectTypeEntrypoints(manifest: Record<string, unknown>): Array<{ subpath: string; target: string }> {
  const entries: Array<{ subpath: string; target: string }> = [];
  const exportsValue = manifest['exports'];
  if (exportsValue && typeof exportsValue === 'object' && !Array.isArray(exportsValue)) {
    for (const [subpath, value] of Object.entries(exportsValue)) {
      const target = typeTarget(value);
      if (target) entries.push({ subpath, target });
    }
  }
  if (!entries.some((entry) => entry.subpath === '.')) {
    const target = manifest['types'];
    if (typeof target === 'string') entries.push({ subpath: '.', target });
  }
  return deduplicate(entries);
}

function typeTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value.endsWith('.d.ts') ? value : undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record['types'] === 'string') return record['types'];
  for (const candidate of Object.values(record)) {
    const result = typeTarget(candidate);
    if (result) return result;
  }
  return undefined;
}

function resolveDeclarationModule(from: string, specifier: string): string {
  if (!specifier.startsWith('.')) throw new Error(`API snapshots cannot follow external declaration re-export '${specifier}'.`);
  const base = resolve(dirname(from), specifier);
  const candidates = extname(base) ? [base.replace(/\.js$/, '.d.ts'), base] : [`${base}.d.ts`, join(base, 'index.d.ts')];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!found) throw new Error(`Unable to resolve declaration re-export '${specifier}' from '${from}'.`);
  return found;
}

function findDeclaration(source: ts.SourceFile, name: string): ts.Statement | undefined {
  return source.statements.find((statement) => declarationNames(statement).includes(name));
}

function declarationNames(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)
    || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) {
    if (statement.name && ts.isIdentifier(statement.name)) return [statement.name.text];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
  }
  return [];
}

function declarationKind(statement: ts.Node): string {
  if (ts.isFunctionDeclaration(statement)) return 'function';
  if (ts.isClassDeclaration(statement)) return 'class';
  if (ts.isInterfaceDeclaration(statement)) return 'interface';
  if (ts.isTypeAliasDeclaration(statement)) return 'type';
  if (ts.isEnumDeclaration(statement)) return 'enum';
  if (ts.isVariableStatement(statement)) return 'variable';
  if (ts.isModuleDeclaration(statement)) return 'namespace';
  return ts.SyntaxKind[statement.kind] ?? 'declaration';
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
}

function discoverPackageManifests(root: string, groups: readonly string[]): string[] {
  const manifests: string[] = [];
  for (const group of groups) {
    const directory = join(root, group);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name, 'package.json');
      if (existsSync(path) && statSync(path).isFile()) manifests.push(path);
    }
  }
  return manifests.sort();
}

function readObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected an object in '${path}'.`);
  return value as Record<string, unknown>;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function deduplicate<T extends { subpath: string }>(entries: T[]): T[] {
  return [...new Map(entries.map((entry) => [entry.subpath, entry])).values()];
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}
