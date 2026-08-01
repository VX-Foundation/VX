/**
 * Generates stable ESM glue for already-resolved VX module dependencies. This
 * file does not resolve source paths or interpret untrusted import specifiers.
 */
import type { ScriptStatement, VisualResolvedNode, VisualResolvedRole, WidgetNode } from '@vx-foundation/types';
import type { ComponentCodegenContext, ComponentCodegenImport } from '../components/codegen-context.js';

export interface GeneratedModuleImports {
  code: string;
  componentFactories: Map<string, string>;
  headlessFactories: Map<string, string>;
}

/** Builds stable, collision-free ESM imports for resolved VX modules. */
export function generateModuleImports(context: ComponentCodegenContext | undefined): GeneratedModuleImports {
  const componentFactories = new Map<string, string>();
  const headlessFactories = new Map<string, string>();
  const lines: string[] = [];
  let componentIndex = 0;
  let headlessIndex = 0;

  for (const imported of uniqueModules(context?.imports ?? [])) {
    if (imported.moduleKind === 'component') {
      const identifier = `__vxCreateComponent_${componentIndex++}`;
      componentFactories.set(imported.moduleId, identifier);
      lines.push(`import { createComponent as ${identifier} } from ${JSON.stringify(imported.specifier)};`);
    } else {
      const identifier = `__vxCreateHeadless_${headlessIndex++}`;
      headlessFactories.set(imported.moduleId, identifier);
      lines.push(`import { createHeadlessModule as ${identifier} } from ${JSON.stringify(imported.specifier)};`);
    }
  }

  return {
    code: lines.length ? `${lines.join('\n')}\n` : '',
    componentFactories,
    headlessFactories
  };
}


/** Returns true for declarations that create executable setup bindings. */
export function isRuntimeDeclaration(statement: ScriptStatement): boolean {
  return statement.kind === 'PropDeclaration' ||
    statement.kind === 'ModelDeclarationNode' ||
    statement.kind === 'ContextProvideDeclaration' ||
    statement.kind === 'ContextInjectDeclaration' ||
    statement.kind === 'ConstDeclaration' ||
    statement.kind === 'StateDeclaration' ||
    statement.kind === 'DeriveDeclaration' ||
    statement.kind === 'QueryDeclaration' ||
    statement.kind === 'ActionDeclaration' ||
    statement.kind === 'StoreDeclaration' ||
    statement.kind === 'SchemaDeclaration' ||
    statement.kind === 'FormDeclaration';
}

/** Reads the validated static name of a Content() outlet. */
export function contentOutletName(node: WidgetNode): string {
  const value = node.callArgument?.text.trim() ?? 'default';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return 'default';
}

/** Returns the imported component contract for one local view identifier. */
export function componentImport(
  context: ComponentCodegenContext | undefined,
  local: string
): ComponentCodegenImport | undefined {
  return context?.imports.find((item) => item.local === local && item.imported === 'default');
}

/** Emits a closed visual-part override object consumed by the child component runtime. */
export function emitPartOverride(
  visualNode: VisualResolvedNode | undefined,
  expression: (source: string) => string
): string {
  if (!visualNode) return '{}';
  const entries: string[] = [];

  if (visualNode.classNames.length > 0 || visualNode.structural || visualNode.semantic) {
    entries.push(`${JSON.stringify('root')}: ${emitRoleOverride(
      visualNode.classNames,
      visualNode.structural,
      visualNode.semantic,
      expression
    )}`);
  }

  for (const part of visualNode.parts) {
    entries.push(`${JSON.stringify(part.name)}: ${emitRoleOverride(
      part.classNames,
      part.structural,
      part.semantic,
      expression
    )}`);
  }

  return `{ ${entries.join(', ')} }`;
}

function emitRoleOverride(
  classNames: readonly string[],
  structural: VisualResolvedRole | undefined,
  semantic: VisualResolvedRole | undefined,
  expression: (source: string) => string
): string {
  const dynamic = [...(structural?.properties ?? []), ...(semantic?.properties ?? [])]
    .filter((property) => property.mode === 'dynamic')
    .map((property) => `{ name: ${JSON.stringify(property.name)}, read: () => ${expression(property.expression.text)} }`);

  return `{ classNames: ${JSON.stringify(classNames)}, structuralRole: ${jsonOrUndefined(structural?.name)}, semanticRole: ${jsonOrUndefined(semantic?.name)}, dynamic: [${dynamic.join(', ')}] }`;
}

function uniqueModules(imports: readonly ComponentCodegenImport[]): ComponentCodegenImport[] {
  const seen = new Set<string>();
  const result: ComponentCodegenImport[] = [];
  for (const imported of imports) {
    if (seen.has(imported.moduleId)) continue;
    seen.add(imported.moduleId);
    result.push(imported);
  }
  return result;
}

function jsonOrUndefined(value: string | undefined): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}
