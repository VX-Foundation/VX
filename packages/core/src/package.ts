import type { BuildVXPackageOptions, BuildVXPackageResult } from '@vx/compiler/package';
import { buildVXPackage } from '@vx/compiler/package';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type PackageLibraryOptions = Omit<BuildVXPackageOptions, 'frameworkVersion'>;

/**
 * Creates a publication staging directory using VX conventions. Package
 * authors provide source code and normal package metadata; VX owns discovery,
 * validation, generated exports, integrity records, and distribution metadata.
 */
export function packageLibrary(
  root: string = process.cwd(),
  options: PackageLibraryOptions = {}
): BuildVXPackageResult {
  return buildVXPackage(root, {
    ...options,
    frameworkVersion: frameworkVersion()
  });
}

function frameworkVersion(): string {
  const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
  const parsed: unknown = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return '0.0.0';
  const version = (parsed as Record<string, unknown>)['version'];
  return typeof version === 'string' ? version : '0.0.0';
}
