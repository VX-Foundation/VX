import path from 'node:path';
import type { BuildOptions } from './types.js';

const TARGETS = new Set(['browser', 'server', 'edge', 'static', 'library']);
const SOURCE_MAPS = new Set([false, 'hidden', 'linked', 'inline']);
const MODES = new Set(['development', 'production']);
const PUBLIC_MODES = new Set(['preserve', 'hashed', 'both']);
const INTEGRITY = new Set([false, 'sha256', 'sha384', 'sha512']);
const IMAGE_FORMATS = new Set(['avif', 'webp', 'png', 'jpeg']);
const LIBRARY_FORMATS = new Set(['es', 'cjs']);

/** Validates untrusted JavaScript configuration before any filesystem mutation. */
export function validateBuildOptionsInput(options: BuildOptions): void {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('VX build options must be an object.');
  requireNonEmptyString(options.root, 'root');
  optionalRelativeDirectory(options.srcDir, 'srcDir');
  optionalRelativeDirectory(options.outDir, 'outDir');
  if (options.mode !== undefined && !MODES.has(options.mode)) throw new TypeError(`Invalid VX build mode '${String(options.mode)}'.`);
  if (options.sourceMaps !== undefined && !SOURCE_MAPS.has(options.sourceMaps)) throw new TypeError(`Invalid VX source-map policy '${String(options.sourceMaps)}'.`);
  for (const [name, value] of [
    ['incremental', options.incremental], ['deterministic', options.deterministic], ['reproducible', options.reproducible], ['bundleAnalysis', options.bundleAnalysis]
  ] as const) optionalBoolean(value, name);
  if (options.targets !== undefined) validateStringArray(options.targets, 'targets', TARGETS, false);
  validateAdapter(options.adapter);
  validateChunkPolicy(options.chunkPolicy);
  validateDependencyOptimization(options.dependencyOptimization);
  validateAssets(options.assets);
  validateLibrary(options.library);
}

function validateAdapter(adapter: BuildOptions['adapter']): void {
  if (adapter === undefined) return;
  if (typeof adapter === 'string') { requireNonEmptyString(adapter, 'adapter'); return; }
  if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) throw new TypeError('VX adapter must be a name or configuration object.');
  requireNonEmptyString(adapter.name, 'adapter.name');
  if (adapter.options !== undefined && (!adapter.options || typeof adapter.options !== 'object' || Array.isArray(adapter.options))) throw new TypeError('VX adapter.options must be an object.');
  const module = adapter.options?.['module'];
  if (module !== undefined) requireNonEmptyString(module, 'adapter.options.module');
}

function validateChunkPolicy(policy: BuildOptions['chunkPolicy']): void {
  if (policy === undefined) return;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new TypeError('VX chunkPolicy must be an object.');
  for (const name of ['maxInitialBytes', 'maxAsyncBytes', 'maxChunkBytes', 'maxChunkCount', 'minimumSharedBytes'] as const) {
    const value = policy[name];
    if (value !== undefined) positiveSafeInteger(value, `chunkPolicy.${name}`);
  }
  optionalBoolean(policy.enforce, 'chunkPolicy.enforce');
}

function validateDependencyOptimization(value: BuildOptions['dependencyOptimization']): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('VX dependencyOptimization must be an object.');
  optionalBoolean(value.enabled, 'dependencyOptimization.enabled');
  optionalBoolean(value.force, 'dependencyOptimization.force');
  if (value.include !== undefined) validateStringArray(value.include, 'dependencyOptimization.include');
  if (value.exclude !== undefined) validateStringArray(value.exclude, 'dependencyOptimization.exclude');
}

function validateAssets(assets: BuildOptions['assets']): void {
  if (assets === undefined) return;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new TypeError('VX assets configuration must be an object.');
  optionalRelativeDirectory(assets.publicDir, 'assets.publicDir');
  if (assets.publicAssetMode !== undefined && !PUBLIC_MODES.has(assets.publicAssetMode)) throw new TypeError(`Invalid public asset mode '${String(assets.publicAssetMode)}'.`);
  if (assets.inlineLimitBytes !== undefined) nonNegativeSafeInteger(assets.inlineLimitBytes, 'assets.inlineLimitBytes');
  if (assets.integrity !== undefined && !INTEGRITY.has(assets.integrity)) throw new TypeError(`Invalid asset integrity algorithm '${String(assets.integrity)}'.`);
  optionalBoolean(assets.preload, 'assets.preload');
  optionalBoolean(assets.prefetch, 'assets.prefetch');
  optionalBoolean(assets.optimize, 'assets.optimize');
  if (assets.responsiveImages === undefined) return;
  if (!Array.isArray(assets.responsiveImages)) throw new TypeError('assets.responsiveImages must be an array.');
  for (const [index, image] of assets.responsiveImages.entries()) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) throw new TypeError(`assets.responsiveImages[${index}] must be an object.`);
    requireSafeRelativeFile(image.source, `assets.responsiveImages[${index}].source`);
    if (!Array.isArray(image.widths) || image.widths.length === 0) throw new TypeError(`assets.responsiveImages[${index}].widths must be a non-empty array.`);
    for (const width of image.widths) positiveSafeInteger(width, `assets.responsiveImages[${index}].widths`);
    if (image.formats !== undefined) validateStringArray(image.formats, `assets.responsiveImages[${index}].formats`, IMAGE_FORMATS, false);
    if (image.quality !== undefined && (!Number.isFinite(image.quality) || image.quality < 1 || image.quality > 100)) throw new TypeError(`assets.responsiveImages[${index}].quality must be between 1 and 100.`);
  }
}

function validateLibrary(library: BuildOptions['library']): void {
  if (library === undefined) return;
  if (!library || typeof library !== 'object' || Array.isArray(library)) throw new TypeError('VX library build configuration must be an object.');
  if (library.entry !== undefined) {
    const entries = typeof library.entry === 'string' ? [library.entry] : library.entry;
    if (!Array.isArray(entries) || entries.length === 0) throw new TypeError('library.entry must be a file path or a non-empty array.');
    for (const entry of entries) requireSafeRelativeFile(entry, 'library.entry');
  }
  if (library.name !== undefined) requireNonEmptyString(library.name, 'library.name');
  if (library.fileName !== undefined) requireSafeFileName(library.fileName, 'library.fileName');
  if (library.formats !== undefined) validateStringArray(library.formats, 'library.formats', LIBRARY_FORMATS, false);
  if (library.external !== undefined) validateStringArray(library.external, 'library.external');
}

function optionalRelativeDirectory(value: unknown, name: string): void {
  if (value === undefined) return;
  requireNonEmptyString(value, name);
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes('..') || value.includes('\0')) throw new TypeError(`VX ${name} must be a safe project-relative directory.`);
}
function requireSafeRelativeFile(value: unknown, name: string): asserts value is string {
  requireNonEmptyString(value, name);
  if (path.isAbsolute(value) || value.split(/[\\/]+/).includes('..') || value.endsWith('/') || value.endsWith('\\') || value.includes('\0')) throw new TypeError(`VX ${name} must be a safe project-relative file path.`);
}
function requireSafeFileName(value: unknown, name: string): asserts value is string {
  requireNonEmptyString(value, name);
  if (value.includes('/') || value.includes('\\') || value.includes('\0') || value === '.' || value === '..') throw new TypeError(`VX ${name} must be a file name without path traversal.`);
}
function validateStringArray(value: unknown, name: string, allowed?: ReadonlySet<unknown>, allowEmpty = true): void {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new TypeError(`VX ${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array.`);
  for (const item of value) {
    requireNonEmptyString(item, name);
    if (allowed && !allowed.has(item)) throw new TypeError(`Invalid VX ${name} value '${item}'.`);
  }
}
function optionalBoolean(value: unknown, name: string): void { if (value !== undefined && typeof value !== 'boolean') throw new TypeError(`VX ${name} must be a boolean.`); }
function positiveSafeInteger(value: unknown, name: string): void { if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`VX ${name} must be a positive safe integer.`); }
function nonNegativeSafeInteger(value: unknown, name: string): void { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`VX ${name} must be a non-negative safe integer.`); }
function requireNonEmptyString(value: unknown, name: string): asserts value is string { if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`VX ${name} must be a non-empty string.`); }
