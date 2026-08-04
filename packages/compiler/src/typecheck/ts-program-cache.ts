import ts from 'typescript';
import type { ComponentContract, Diagnostic, ScriptBlockNode, SourceSpan } from '@vx-foundation/types';
import { generateVirtualTS, type VirtualTSOutput } from './virtual-ts.js';
import { createVirtualCompilerHost } from './ts-host.js';
import { mapTSDiagnostic } from './ts-diagnostic-mapper.js';
import { loadTSConfig, createTSProgramCacheKey } from './tsconfig-loader.js';

export interface ScriptTypeCheckResult {
  program: ts.Program;
  checker: ts.TypeChecker;
  diagnostics: Diagnostic[];
  virtualOutput: VirtualTSOutput;
}

const defaultCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  // Strict is disabled because VX manages its own scope and undeclared-name
  // checking via VX_UNDECLARED_VARIABLE; strict mode causes too many false
  // positives on VX-specific identifier patterns.
  strict: false,
  noImplicitAny: false,
  noEmit: true,
  allowJs: true,
  skipLibCheck: true,
  incremental: false
};

/**
 * TypeScript diagnostic codes that the VX compiler already handles through its
 * own semantic analysis passes (graph-builder, script-sema, partition validator,
 * view type-checker).  We suppress these codes from the TS program pass to avoid
 * duplicate or false-positive diagnostics surfacing to the user.
 *
 * TS2304 – "Cannot find name 'x'":  VX resolves its own reactive graph scope;
 *   identifiers like state/derive/action names are declared in VX, not TS.
 * TS2307 – "Cannot find module './Card.vx'": VX imports (.vx files) are resolved
 *   by the VX project/bundler system, not by TypeScript's module resolver.
 * TS2339 – "Property does not exist on type 'x'": VX uses `any`-typed signals
 *   and runtime helpers whose types are intentionally opaque to TS.
 * TS2552 – "Cannot find name 'x'. Did you mean 'y'?" – variant of TS2304.
 * TS2540 – "Cannot assign to 'x' because it is a read-only property": Signal
 *   mutation in VX is mediated by the runtime, not TS declarations.
 * TS2669 – "Augmentations for the global scope can only be nested in external
 *   modules": only fires when the virtual file has no top-level imports/exports.
 *   Covered by the 'export {};' preamble in virtual-ts.ts but suppressed as a
 *   defence-in-depth measure.
 * TS2693 – "'X' only refers to a type, but is being used as a value here":
 *   Arises from VX primitive type aliases (String, Int, Bool…) in runtime exprs.
 * TS2749 – "'RegisterUser' refers to a value, but is being used as a type here":
 *   VX schemas, stores, and forms are used as type annotations in VX's own type
 *   system; TS sees them as values (not types) and generates this false positive.
 */
const SUPPRESSED_TS_CODES = new Set([2304, 2307, 2339, 2552, 2540, 2669, 2693, 2749, 5074, 6379]);

/**
 * Module-level content-addressable cache.
 * Key  = virtual TS source code string (unique per unique #script content)
 * Value = the previously-computed ScriptTypeCheckResult
 *
 * ts.createProgram + type checking is expensive on the first call (~1–3 s per
 * unique program) because TypeScript has to load lib.es2022.d.ts and all its
 * transitive dependencies.  Caching by content means repeated analyze() calls
 * with the same #script code return instantly.
 *
 * The cache is bounded to MAX_CACHE_SIZE entries to prevent unbounded memory
 * growth during long-running dev-server sessions.
 */
const MAX_CACHE_SIZE = 128;
const resultCache = new Map<string, ScriptTypeCheckResult>();

/**
 * Builds a real TypeScript Program and TypeChecker for a VX #script block.
 * Performs type inference and syntactic/semantic diagnostic collection,
 * then filters out codes that are handled by VX's own semantic passes.
 *
 * Results are memoized by virtual TS source content — repeated calls with the
 * same #script code are O(1) cache lookups after the first compilation.
 */
export function analyzeScriptWithTSProgram(
  script: ScriptBlockNode | undefined,
  filePath: string,
  fallbackSpan: SourceSpan,
  options: ts.CompilerOptions = defaultCompilerOptions,
  importedContracts?: Map<string, ComponentContract>,
  rootDir?: string
): ScriptTypeCheckResult {
  // Load tsconfig if rootDir is provided and options weren't explicitly passed
  const effectiveOptions = rootDir && options === defaultCompilerOptions
    ? loadTSConfig(rootDir)
    : options;

  const virtualOutput = generateVirtualTS(script, filePath, importedContracts);
  const cacheKey = createTSProgramCacheKey(virtualOutput.code, effectiveOptions);

  const cached = resultCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const virtualPath = `${filePath}.ts`.replace(/\\/g, '/');
  const virtualFiles = new Map<string, string>([[virtualPath, virtualOutput.code]]);

  // Add generated .d.ts files for imported VX modules
  for (const [dtsPath, dtsContent] of virtualOutput.dependencies) {
    virtualFiles.set(dtsPath, dtsContent);
  }

  const host = createVirtualCompilerHost(effectiveOptions, virtualFiles);
  const program = ts.createProgram({
    rootNames: [virtualPath],
    options: effectiveOptions,
    host
  });

  const checker = program.getTypeChecker();
  const tsDiagnostics = ts.getPreEmitDiagnostics(program);

  const vxDiagnostics: Diagnostic[] = [];
  for (const d of tsDiagnostics) {
    if (SUPPRESSED_TS_CODES.has(d.code)) continue;
    vxDiagnostics.push(mapTSDiagnostic(d, virtualOutput.mappings, fallbackSpan));
  }

  const result: ScriptTypeCheckResult = {
    program,
    checker,
    diagnostics: vxDiagnostics,
    virtualOutput
  };

  // Evict oldest entry when cache is full (simple FIFO eviction)
  if (resultCache.size >= MAX_CACHE_SIZE) {
    const firstKey = resultCache.keys().next().value;
    if (firstKey !== undefined) resultCache.delete(firstKey);
  }
  resultCache.set(cacheKey, result);

  return result;
}

/** Clears the program cache. Useful in tests or after a full project rebuild. */
export function clearTSProgramCache(): void {
  resultCache.clear();
}
