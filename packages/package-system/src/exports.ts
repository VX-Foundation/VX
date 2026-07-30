import type { VXPackageExportTarget } from './types.js';

export interface ExportIssue {
  code: string;
  message: string;
}

export function validatePackageExports(value: unknown): { valid: boolean; issues: ExportIssue[] } {
  const issues: ExportIssue[] = [];
  if (!record(value)) return { valid: false, issues: [{ code: 'VX_PACKAGE_EXPORTS_OBJECT', message: 'Package exports must be an object.' }] };
  for (const [subpath, target] of Object.entries(value)) {
    if (!(subpath === '.' || /^\.\/[A-Za-z0-9@._*/-]+$/.test(subpath)) || subpath.includes('..') || subpath.includes('\\')) {
      issues.push({ code: 'VX_PACKAGE_EXPORT_KEY', message: `Invalid package export key '${subpath}'.` });
      continue;
    }
    validateTarget(target, subpath, issues, 0);
  }
  return { valid: issues.length === 0, issues };
}

export function resolvePackageExport(
  exportsMap: Readonly<Record<string, VXPackageExportTarget>>,
  subpath: string,
  conditions: readonly string[]
): string | undefined {
  const selected = selectSubpath(exportsMap, subpath);
  return resolveTarget(selected?.target, conditions, selected?.capture);
}

export function flattenPackageExportTargets(target: VXPackageExportTarget): string[] {
  if (typeof target === 'string') return [target];
  if (target === null) return [];
  if (Array.isArray(target)) return target.flatMap(flattenPackageExportTargets);
  if (!record(target)) return [];
  return Object.values(target).flatMap((item) => flattenPackageExportTargets(item as VXPackageExportTarget));
}

function selectSubpath(exportsMap: Readonly<Record<string, VXPackageExportTarget>>, subpath: string): { target: VXPackageExportTarget; capture?: string } | undefined {
  if (Object.prototype.hasOwnProperty.call(exportsMap, subpath)) return { target: exportsMap[subpath]! };
  const patterns = Object.keys(exportsMap)
    .filter((key) => key.includes('*'))
    .sort((left, right) => specificity(right) - specificity(left) || left.localeCompare(right));
  for (const pattern of patterns) {
    const [prefix, suffix] = pattern.split('*');
    if (prefix === undefined || suffix === undefined || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const capture = subpath.slice(prefix.length, subpath.length - suffix.length);
    return { target: exportsMap[pattern]!, capture };
  }
  return undefined;
}

function resolveTarget(target: VXPackageExportTarget | undefined, conditions: readonly string[], capture?: string): string | undefined {
  if (target === undefined || target === null) return undefined;
  if (typeof target === 'string') return substitute(target, capture);
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const resolved = resolveTarget(candidate, conditions, capture);
      if (resolved) return resolved;
    }
    return undefined;
  }
  if (!record(target)) return undefined;
  for (const condition of [...conditions, 'default']) {
    if (!Object.prototype.hasOwnProperty.call(target, condition)) continue;
    const resolved = resolveTarget(target[condition] as VXPackageExportTarget, conditions, capture);
    if (resolved) return resolved;
  }
  return undefined;
}

function validateTarget(value: unknown, path: string, issues: ExportIssue[], depth: number): void {
  if (depth > 16) { issues.push({ code: 'VX_PACKAGE_EXPORT_DEPTH', message: `Export '${path}' exceeds the nesting limit.` }); return; }
  if (value === null) return;
  if (typeof value === 'string') {
    if (!safeTarget(value)) issues.push({ code: 'VX_PACKAGE_EXPORT_TARGET', message: `Export '${path}' has unsafe target '${value}'.` });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0 || value.length > 64) issues.push({ code: 'VX_PACKAGE_EXPORT_ARRAY', message: `Export '${path}' must contain between 1 and 64 alternatives.` });
    for (const item of value) validateTarget(item, path, issues, depth + 1);
    return;
  }
  if (!record(value)) { issues.push({ code: 'VX_PACKAGE_EXPORT_TARGET_TYPE', message: `Export '${path}' has an invalid target.` }); return; }
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.length > 64) issues.push({ code: 'VX_PACKAGE_EXPORT_CONDITIONS', message: `Export '${path}' has an invalid number of conditions.` });
  for (const [condition, candidate] of Object.entries(value)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(condition)) issues.push({ code: 'VX_PACKAGE_EXPORT_CONDITION', message: `Export '${path}' has invalid condition '${condition}'.` });
    validateTarget(candidate, `${path}:${condition}`, issues, depth + 1);
  }
}

function safeTarget(value: string): boolean {
  return value.startsWith('./') && value.length <= 2048 && !value.includes('\\') && !value.includes('\0') && !value.split('/').includes('..') && !value.includes('node_modules');
}
function substitute(value: string, capture?: string): string { return capture === undefined ? value : value.replaceAll('*', capture); }
function specificity(value: string): number { return value.replace('*', '').length; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
