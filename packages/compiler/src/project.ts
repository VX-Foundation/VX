import type {
  ComponentArtifact,
  ComponentProjectBuild,
  ComponentProjectIR,
  Diagnostic,
  SourceSpan
} from '@vx-foundation/types';

import { analyze } from './index.js';
import { lower, UnsupportedLoweringError } from './codegen/index.js';
import type { ComponentCodegenContext, ComponentCodegenImport } from './components/codegen-context.js';
import { createComponentBindingContext } from './components/context.js';
import { resolveComponentProject } from './components/resolver.js';
import type { ResolveComponentProjectOptions } from './components/resolver.js';

export interface CompileComponentProjectOptions extends ResolveComponentProjectOptions {
  failFast?: boolean;
}

/**
 * Compiles a canonical VX component graph into isolated ESM artifacts.
 * Resolution and validation always complete before executable code is emitted.
 */
export function compileComponentProject(
  entryPath: string,
  options: CompileComponentProjectOptions
): ComponentProjectBuild {
  const resolved = resolveComponentProject(entryPath, options);
  const diagnostics = [...resolved.diagnostics];
  const artifacts = new Map<string, ComponentArtifact>();
  const project = resolved.project;
  if (!project || hasErrors(diagnostics)) return { entryId: project?.entryId ?? '', artifacts, diagnostics };

  for (const moduleId of project.order) {
    const module = project.modules.get(moduleId);
    if (!module) continue;

    const unavailableDependency = module.imports.find((imported) => !artifacts.has(imported.moduleId));
    if (unavailableDependency) {
      diagnostics.push({
        code: 'VX_COMPONENT_DEPENDENCY_NOT_EMITTED',
        severity: 'error',
        message: `Module '${module.filePath}' depends on '${unavailableDependency.resolvedPath}', which failed validation or lowering.`,
        span: unavailableDependency.span
      });
      if (options.failFast) break;
      continue;
    }

    const bindingContext = createComponentBindingContext(module, project);
    const result = analyze(module.ast, { 
      component: bindingContext, 
      tsCheck: true,
      rootDir: project.rootDir
    });
    diagnostics.push(...result.diagnostics);
    if (hasErrors(result.diagnostics)) {
      if (options.failFast) break;
      continue;
    }

    const codegenContext = createCodegenContext(project, moduleId);
    try {
      const lowered = lower(module.ast, result.graph, result.visual, result.data, { component: codegenContext });
      artifacts.set(moduleId, {
        id: moduleId,
        filePath: module.filePath,
        outputFileName: moduleFileName(moduleId),
        clientCode: lowered.clientCode,
        serverCode: lowered.serverCode,
        viewSourceMap: lowered.viewSourceMap,
        contract: module.contract
      });
    } catch (cause) {
      diagnostics.push(loweringDiagnostic(cause, module.ast.span));
      if (options.failFast) break;
    }
  }

  return { entryId: project.entryId, artifacts, diagnostics };
}

function createCodegenContext(project: ComponentProjectIR, moduleId: string): ComponentCodegenContext {
  const module = project.modules.get(moduleId);
  if (!module) throw new Error(`VX project graph is missing module '${moduleId}'.`);
  const imports: ComponentCodegenImport[] = [];

  for (const imported of module.imports) {
    const target = project.modules.get(imported.moduleId);
    if (!target) throw new Error(`VX project graph is missing imported module '${imported.moduleId}'.`);
    const specifier = `./${moduleFileName(target.id)}`;
    for (const binding of imported.bindings) {
      const exported = binding.imported === 'default'
        ? undefined
        : target.contract.exports.find((item) => item.name === binding.imported);
      imports.push({
        local: binding.local,
        imported: binding.imported,
        moduleId: imported.moduleId,
        specifier,
        moduleKind: target.contract.kind,
        contract: target.contract,
        ...(exported ? { exported } : {})
      });
    }
  }

  return { contract: module.contract, moduleKind: module.contract.kind, imports };
}

function moduleFileName(moduleId: string): string {
  const safe = moduleId.replace(/[^A-Za-z0-9._-]/g, '-');
  return `${safe}.js`;
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function loweringDiagnostic(cause: unknown, fallbackSpan: SourceSpan): Diagnostic {
  if (cause instanceof UnsupportedLoweringError) {
    return { code: cause.code, severity: 'error', message: cause.message, span: cause.span };
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return {
    code: 'VX_COMPONENT_LOWERING_FAILURE',
    severity: 'error',
    message: `Component lowering failed: ${message}`,
    span: fallbackSpan
  };
}
