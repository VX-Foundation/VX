import type { ASTNode, DataProgramIR, ScriptBlockNode, ViewBlockNode, ProgramNode, Diagnostic, VisualDesignSystem, VisualProgramIR } from '@vx/types';
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

export type { ReactiveGraph, ReactiveNode } from './analyze/graph-builder.js';
export { DiagnosticCollector } from './analyze/diagnostics.js';
export { lower, UnsupportedLoweringError } from './codegen/index.js';
export { resolveVisualProgram } from './visual/resolver.js';
export { buildDataProgram } from './data/builder.js';
export type { LowerResult, LowerOptions } from './codegen/index.js';
export { createComponentBindingContext } from './components/context.js';

export interface AnalyzeOptions {
  designSystem?: VisualDesignSystem;
  component?: ComponentBindingContext;
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
 * @param ast The AST produced by @vx/language
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
  const visual = viewBlock ? resolveVisualProgram(viewBlock, graph, diagnostics, options.designSystem) : undefined;

  // 9. Validate component/module contracts and imported use sites.
  if (options.component) validateComponentModule(options.component, diagnostics);

  // 10. Partition validation (Server vs Client boundaries and security)
  if (scriptBlock) {
    validatePartitioning(scriptBlock, viewBlock, graph, diagnostics);
  }

  return {
    graph,
    diagnostics: diagnostics.getDiagnostics(),
    data,
    ...(visual ? { visual } : {}),
  };
}
