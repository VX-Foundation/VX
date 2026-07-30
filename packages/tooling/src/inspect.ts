import { analyze, lower } from '@vx/compiler/core';
import { parse } from '@vx/language';
import type { Diagnostic, ExecutionSide, SourceSpan } from '@vx/types';

export interface ReactiveInspectionNode {
  name: string;
  kind: string;
  dependencies: string[];
  dependents: string[];
}

export interface BoundaryInspection {
  name: string;
  kind: string;
  side: ExecutionSide;
  span: SourceSpan;
}

export interface VXInspection {
  diagnostics: Diagnostic[];
  reactiveGraph: ReactiveInspectionNode[];
  visual: {
    scopeId?: string;
    roleNames: string[];
    cssText: string;
    nodes: Array<{ id: string; widget: string; roles: string[]; classes: string[] }>;
  };
  boundaries: BoundaryInspection[];
  generated?: { client: string; server: string; sourceMap: unknown[] };
}

/** Builds one serializable tooling snapshot directly from compiler-owned data. */
export function inspectVX(source: string, filePath = '<memory>', includeGenerated = true): VXInspection {
  const parsed = parse(source, filePath);
  const analysis = analyze(parsed.ast);
  const diagnostics = [...parsed.diagnostics, ...analysis.diagnostics];
  const dependents = new Map<string, string[]>();
  for (const [name, node] of analysis.graph.nodes) {
    for (const dependency of node.dependencies) {
      const bucket = dependents.get(dependency) ?? [];
      bucket.push(name);
      dependents.set(dependency, bucket);
    }
  }
  const reactiveGraph = analysis.graph.order.map((name) => {
    const node = analysis.graph.nodes.get(name);
    return {
      name,
      kind: node?.statement.kind ?? 'unknown',
      dependencies: [...(node?.dependencies ?? [])],
      dependents: [...(dependents.get(name) ?? [])]
    };
  });
  const visual = {
    ...(analysis.visual ? { scopeId: analysis.visual.scopeId } : {}),
    roleNames: [...(analysis.visual?.roleNames ?? [])],
    cssText: analysis.visual?.cssText ?? '',
    nodes: (analysis.visual?.nodes ?? []).map((node) => ({
      id: node.id,
      widget: node.widget.tagName,
      roles: [node.structural?.name, node.semantic?.name].filter((value): value is string => Boolean(value)),
      classes: [...node.classNames]
    }))
  };
  const boundaries: BoundaryInspection[] = [];
  for (const block of parsed.ast.blocks) {
    if (block.kind !== 'ScriptBlock') continue;
    for (const statement of block.statements) {
      if (!('side' in statement)) continue;
      boundaries.push({
        name: 'name' in statement && typeof statement.name === 'string' ? statement.name : statement.kind,
        kind: statement.kind,
        side: statement.side,
        span: statement.span
      });
    }
  }

  const result: VXInspection = { diagnostics, reactiveGraph, visual, boundaries };
  if (includeGenerated && !diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const generated = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
    result.generated = { client: generated.clientCode, server: generated.serverCode, sourceMap: generated.viewSourceMap };
  }
  return result;
}
