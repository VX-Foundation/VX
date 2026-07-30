import type { ASTNode, DataProgramIR, ProgramNode, ScriptBlockNode, SourceSpan, ViewBlockNode, ViewNode, ViewSourceMapEntry, VisualProgramIR } from '@vx/types';
import { PRIMITIVE_SOURCES } from '@vx/widgets';
import { generateDomCode } from './dom.js';
import { generateServerCode } from './server.js';

import type { ReactiveGraph } from '../analyze/graph-builder.js';
import { DiagnosticCollector } from '../analyze/diagnostics.js';
import { resolveVisualProgram } from '../visual/resolver.js';
import { buildDataProgram } from '../data/builder.js';
import type { ComponentCodegenContext } from '../components/codegen-context.js';


export class UnsupportedLoweringError extends Error {
  constructor(
    public readonly code: 'VX3001' | 'VX3003' | 'VX3004' | 'VX3005',
    message: string,
    public readonly span: SourceSpan
  ) {
    super(message);
    this.name = 'UnsupportedLoweringError';
  }
}

export interface LowerResult {
  clientCode: string;
  serverCode: string;
  viewSourceMap: ViewSourceMapEntry[];
}

export interface LowerOptions {
  component?: ComponentCodegenContext;
}

/**
 * The 'Lower' pass of the VX compilation pipeline.
 * Lowers the analyzed AST into target-specific executable code (Client DOM + Server actions).
 */
export function lower(
  ast: ASTNode,
  graph: ReactiveGraph,
  visual?: VisualProgramIR,
  data?: DataProgramIR,
  options: LowerOptions = {}
): LowerResult {
  assertLoweringReady(ast, options.component);
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

  const collector = new DiagnosticCollector();
  const resolvedVisual = viewBlock ? (visual ?? resolveVisualProgram(viewBlock, graph, collector)) : undefined;
  const resolvedData = data ?? buildDataProgram(scriptBlock, graph, collector);

  // Generate Client Code (DOM + reactivity + Visual IR + managed data runtime)
  const client = generateDomCode(scriptBlock, viewBlock, graph, resolvedData, resolvedVisual, options.component);

  // Generate Server Code (Server actions + edge compute)
  const serverCode = generateServerCode(scriptBlock, viewBlock, resolvedData, resolvedVisual, options.component);

  return {
    clientCode: client.code,
    serverCode,
    viewSourceMap: client.viewSourceMap
  };
}


function assertLoweringReady(ast: ASTNode, component?: ComponentCodegenContext): void {
  if (ast.kind !== 'Program') return;

  for (const block of ast.blocks) {
    if (block.kind === 'ViewBlock') {
      const customWidget = findUnsupportedWidget(block.children, component);
      if (customWidget) {
        throw new UnsupportedLoweringError(
          'VX3004',
          `Component '${customWidget.tagName}' requires a resolved component-project context. Compile imported components through compileComponentProject().`,
          customWidget.span
        );
      }
    }
  }
}

function findUnsupportedWidget(
  nodes: ViewNode[],
  component?: ComponentCodegenContext
): Extract<ViewNode, { kind: 'Widget' }> | undefined {
  for (const node of nodes) {
    if (node.kind === 'Widget') {
      const imported = component?.imports.some((item) => item.local === node.tagName && item.imported === 'default');
      if (!['Content', 'Dynamic', 'Portal'].includes(node.tagName) && !(node.tagName in PRIMITIVE_SOURCES) && !imported) return node;
      const child = findUnsupportedWidget(node.children, component);
      if (child) return child;
      for (const region of node.contentRegions) {
        const contentChild = findUnsupportedWidget(region.children, component);
        if (contentChild) return contentChild;
      }
    } else if (node.kind === 'IfBlock') {
      for (const branch of node.branches) {
        const child = findUnsupportedWidget(branch.children, component);
        if (child) return child;
      }
    } else if (node.kind === 'WhenBlock') {
      for (const branch of node.branches) {
        const child = findUnsupportedWidget(branch.children, component);
        if (child) return child;
      }
      if (node.fallback) {
        const child = findUnsupportedWidget(node.fallback, component);
        if (child) return child;
      }
    } else if (node.kind === 'KeyedCollection') {
      const child = findUnsupportedWidget(node.children, component);
      if (child) return child;
      for (const branch of node.fallbacks) {
        const fallbackChild = findUnsupportedWidget(branch.children, component);
        if (fallbackChild) return fallbackChild;
      }
    }
  }
  return undefined;
}
