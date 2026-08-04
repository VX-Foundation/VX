import type { ASTNode, DataProgramIR, ScriptBlockNode, ViewBlockNode, ProgramNode, Diagnostic, VisualDesignSystem, VisualProgramIR, VisualRoleDeclarationNode, ComponentContract } from '@vx-foundation/types';
import { DiagnosticCollector } from './analyze/diagnostics.js';
import { buildReactiveGraph } from './analyze/graph-builder.js';
import type { ReactiveGraph } from './analyze/graph-builder.js';
import { checkViewTypes } from './analyze/type-checker.js';
import { validatePartitioning } from './analyze/partition.js';
import { validateVisualRoles } from './analyze/visual-roles.js';
import { validateAccessibility } from './analyze/accessibility.js';
import { validateScriptSemantics } from './analyze/script-semantics.js';
import { resolveVisualProgram } from './visual/resolver.js';
import { buildDataProgram } from './data/builder.js';
import type { ComponentBindingContext } from './components/context.js';
import { validateComponentModule } from './components/validation.js';
import { validateForms } from './forms/validation.js';
import { analyzeScriptWithTSProgram } from './typecheck/ts-program-cache.js';

export type { ReactiveGraph, ReactiveNode } from './analyze/graph-builder.js';
export { DiagnosticCollector } from './analyze/diagnostics.js';
export { lower, UnsupportedLoweringError } from './codegen/index.js';
export { resolveVisualProgram } from './visual/resolver.js';
export { buildDataProgram } from './data/builder.js';
export type { LowerResult, LowerOptions } from './codegen/index.js';
export { createComponentBindingContext } from './components/context.js';
export { analyzeScriptWithTSProgram } from './typecheck/ts-program-cache.js';

export interface AnalyzeOptions {
  designSystem?: VisualDesignSystem;
  component?: ComponentBindingContext;
  /** Visual roles imported from visual modules, keyed by local name. */
  importedVisualRoles?: Map<string, VisualRoleDeclarationNode>;
  /** Contracts of imported VX modules for TypeScript .d.ts generation */
  importedContracts?: Map<string, ComponentContract>;
  /** Project root directory for loading tsconfig.json */
  rootDir?: string;
  /**
   * When true, runs the full TypeScript Compiler API (ts.createProgram) over
   * the #script block for deep type inference beyond VX's own semantic passes.
   *
   * Defaults to **false** because ts.createProgram has a ~1–3 s cold-start per
   * unique script. Enable in the bundler, LSP, and explicit type-check invocations.
   */
  tsCheck?: boolean;
}

export interface AnalyzeResult {
  graph: ReactiveGraph;
  diagnostics: Diagnostic[];
  visual?: VisualProgramIR;
  data: DataProgramIR;
}

/**
 * The 'Analyze' pass of the VX compilation pipeline.
 * Constructs the reactive graph from the AST, validates boundaries and performs static type-checking.
 *
 * @param ast The AST produced by @vx-foundation/language
 * @returns The analyzed reactive graph and any diagnostics (errors/warnings)
 */
export function analyze(ast: ASTNode, options: AnalyzeOptions = {}): AnalyzeResult {
  const diagnostics = new DiagnosticCollector();

  // Find the top-level Script and View blocks
  let scriptBlock: ScriptBlockNode | undefined;
  let viewBlock: ViewBlockNode | undefined;

  if (ast.kind === 'Program') {
    const program = ast as ProgramNode;
    for (const block of program.blocks) {
      if (block.kind === 'ScriptBlock') {
        scriptBlock = block;
      } else if (block.kind === 'ViewBlock') {
        viewBlock = block;
      }
    }
  }

  // 1. Build the Reactive Graph
  let graph: ReactiveGraph = { nodes: new Map(), order: [] };
  if (scriptBlock) {
    graph = buildReactiveGraph(scriptBlock, diagnostics);
  }

  // 2. Build target-neutral data/action/effect/store IR.
  const data = buildDataProgram(scriptBlock, graph, diagnostics);

  // 3. Validate ownership, managed data contracts, and mutation boundaries.
  if (scriptBlock) {
    validateScriptSemantics(scriptBlock, graph, data, diagnostics);
  }

  // 4. Validate schemas, forms, and progressive submission contracts.
  if (scriptBlock) validateForms(scriptBlock, diagnostics);

  // 5. Perform Type Checking on the View
  if (viewBlock && graph) {
    checkViewTypes(viewBlock, graph, diagnostics, options.component);
  }

  // 6. Validate visual-role invariants without lowering them.
  if (viewBlock) {
    validateVisualRoles(viewBlock, diagnostics);
  }

  // 7. Enforce source-provable accessibility invariants.
  if (viewBlock) {
    validateAccessibility(viewBlock, diagnostics);
  }

  // 8. Resolve compiler-owned visual intent into target-neutral Visual IR.
  // Merge visual roles from the component binding context with any explicitly passed ones.
  const effectiveImportedRoles: Map<string, VisualRoleDeclarationNode> | undefined =
    (() => {
      const fromContext = options.component?.visualRoles;
      const fromOptions = options.importedVisualRoles;
      if (!fromContext?.size && !fromOptions?.size) return undefined;
      const merged = new Map<string, VisualRoleDeclarationNode>();
      if (fromContext) for (const [key, binding] of fromContext) merged.set(key, binding.declaration);
      if (fromOptions) for (const [key, decl] of fromOptions) merged.set(key, decl);
      return merged.size > 0 ? merged : undefined;
    })();
  const visual = viewBlock ? resolveVisualProgram(viewBlock, graph, diagnostics, options.designSystem, effectiveImportedRoles) : undefined;

  // 9. Validate component/module contracts and imported use sites.
  if (options.component) validateComponentModule(options.component, diagnostics);

  // 10. Partition validation (Server vs Client boundaries and security)
  if (scriptBlock) {
    validatePartitioning(scriptBlock, viewBlock, graph, diagnostics);
  }

  // 11. Real TypeScript Compiler API analysis over #script (opt-in)
  if (scriptBlock && options.tsCheck) {
    // Build imported contracts map from component binding context
    const importedContracts = new Map<string, ComponentContract>();
    if (options.component) {
      for (const imported of options.component.module.imports) {
        const target = options.component.project.modules.get(imported.moduleId);
        if (target) {
          importedContracts.set(imported.source, target.contract);
        }
      }
    }
    
    const tsResult = analyzeScriptWithTSProgram(
      scriptBlock,
      ast.span.filePath,
      ast.span,
      undefined,
      importedContracts,
      options.rootDir
    );
    for (const diag of tsResult.diagnostics) {
      diagnostics.addDiagnostic(diag);
    }
  }

  return {
    graph,
    diagnostics: diagnostics.getDiagnostics(),
    data,
    ...(visual ? { visual } : {}),
  };
}
