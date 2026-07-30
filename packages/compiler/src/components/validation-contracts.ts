import type { ComponentContract, ComponentModuleIR, ComponentProjectIR, ImportDeclaration, ScriptBlockNode } from '@vx/types';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import { findScriptBlock, type findViewBlock } from './contract.js';
import { ALLOWED_PUBLIC_KINDS, RESERVED_IMPORT_NAMES, UNSAFE_MEMBER_NAMES } from './validation-constants.js';

export function validateContractDeclarations(
  contract: ComponentContract,
  script: ScriptBlockNode | undefined,
  diagnostics: DiagnosticCollector
): void {
  const namespaces = [
    ['generic', contract.generics],
    ['prop', contract.props],
    ['output', contract.outputs],
    ['content region', contract.content],
    ['visual part', contract.parts],
    ['export', contract.exports]
  ] as const;

  for (const [label, entries] of namespaces) {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.name)) {
        diagnostics.error(
          'VX_COMPONENT_DUPLICATE_CONTRACT_MEMBER',
          `Duplicate ${label} '${entry.name}' in component contract.`,
          entry.span
        );
      }
      seen.add(entry.name);
    }
  }

  for (const [, entries] of namespaces) {
    for (const entry of entries) {
      if (UNSAFE_MEMBER_NAMES.has(entry.name)) {
        diagnostics.error(
          'VX_COMPONENT_UNSAFE_CONTRACT_NAME',
          `Contract member '${entry.name}' is reserved because it can alter JavaScript object semantics.`,
          entry.span
        );
      }
    }
  }

  if (contract.kind === 'component' && contract.exports.length > 0) {
    for (const exported of contract.exports) {
      diagnostics.error(
        'VX_COMPONENT_NAMED_EXPORT',
        `Visual component '${contract.name}' cannot expose named headless export '${exported.name}'.`,
        exported.span,
        'Move reusable logic into a dedicated headless .vx module and import it explicitly.'
      );
    }
  }

  const providedContexts = new Set<string>();
  const forwardingCapabilities = new Set<string>();
  for (const statement of script?.statements ?? []) {
    if (statement.kind === 'ContextProvideDeclaration') {
      if (providedContexts.has(statement.name)) diagnostics.error(
        'VX_COMPONENT_DUPLICATE_CONTEXT_PROVIDER',
        `Context '${statement.name}' is provided more than once by the same component.`,
        statement.span
      );
      providedContexts.add(statement.name);
    }
    if (statement.kind === 'ForwardDeclaration') {
      if (forwardingCapabilities.has(statement.name)) diagnostics.error(
        'VX_COMPONENT_DUPLICATE_FORWARD_CAPABILITY',
        `Forwarding capability '${statement.name}' is declared more than once.`,
        statement.span
      );
      forwardingCapabilities.add(statement.name);
    }
    if (statement.kind === 'ImportDeclaration' && (statement.side !== 'client' || statement.visibility === 'public')) {
      diagnostics.error(
        'VX_COMPONENT_IMPORT_MODIFIER',
        'VX imports cannot use server or export modifiers.',
        statement.span
      );
    }
    if (
      (statement.kind === 'GenericDeclaration' ||
        statement.kind === 'ModelDeclarationNode' ||
        statement.kind === 'ContextProvideDeclaration' ||
        statement.kind === 'ContextInjectDeclaration' ||
        statement.kind === 'ForwardDeclaration') &&
      contract.kind !== 'component'
    ) {
      diagnostics.error(
        'VX_COMPONENT_VISUAL_CONTRACT_ONLY',
        `'${statement.kind}' is only valid in visual component modules.`,
        statement.span
      );
    }
    if (
      (statement.kind === 'GenericDeclaration' ||
        statement.kind === 'ModelDeclarationNode' ||
        statement.kind === 'ContextProvideDeclaration' ||
        statement.kind === 'ContextInjectDeclaration' ||
        statement.kind === 'ForwardDeclaration') &&
      (statement.side === 'server' || statement.visibility === 'public')
    ) {
      diagnostics.error(
        'VX_COMPONENT_INVALID_CONTRACT_MODIFIER',
        `'${statement.kind}' cannot use server or export modifiers.`,
        statement.span
      );
    }
    if (statement.kind === 'ModelDeclarationNode' && statement.outputName === statement.name) {
      diagnostics.error(
        'VX_COMPONENT_MODEL_OUTPUT_COLLISION',
        `Model '${statement.name}' cannot emit through an output with the same name.`,
        statement.span
      );
    }
    if (statement.kind === 'PropDeclaration' && statement.side === 'server') {
      diagnostics.error(
        'VX_COMPONENT_SERVER_PROP',
        `Component prop '${statement.name}' cannot be server-only.`,
        statement.span,
        'Pass serializable data from a server boundary or expose server behavior through an action.'
      );
    }
    if (statement.visibility === 'public' && statement.side === 'server' && statement.kind !== 'ActionDeclaration') {
      diagnostics.error(
        'VX_COMPONENT_UNTRANSPORTABLE_SERVER_EXPORT',
        `Server declaration '${statement.name ?? statement.kind}' cannot be exported directly to client modules.`,
        statement.span,
        'Expose server behavior through a typed server action.'
      );
    }
    if (statement.visibility === 'public' && !ALLOWED_PUBLIC_KINDS.has(statement.kind)) {
      diagnostics.error(
        'VX_COMPONENT_INVALID_EXPORT',
        `'${statement.kind}' cannot be exported from a VX headless module.`,
        statement.span,
        'Export const, derive, query, action, store, schema, or form declarations. Component props, outputs, content, and parts are already described by the component contract.'
      );
    }

    if (
      (statement.kind === 'OutputDeclaration' || statement.kind === 'ContentDeclaration' || statement.kind === 'VisualPartDeclaration') &&
      statement.side === 'server'
    ) {
      diagnostics.error(
        'VX_COMPONENT_CLIENT_CONTRACT_ONLY',
        `${statement.kind.replace('Declaration', '')} '${statement.name}' belongs to the client-visible component contract and cannot be server-only.`,
        statement.span
      );
    }
  }
}

export function validateImports(
  module: ComponentModuleIR,
  project: ComponentProjectIR,
  diagnostics: DiagnosticCollector
): void {
  const locals = new Map<string, ImportDeclaration>();
  const scriptStatements = findScriptBlock(module.ast)?.statements ?? [];
  const declarations = scriptStatements.filter(
    (statement): statement is ImportDeclaration => statement.kind === 'ImportDeclaration'
  );
  const localDeclarations = new Set(
    scriptStatements
      .filter((statement) => statement.kind !== 'ImportDeclaration' && Boolean(statement.name))
      .map((statement) => statement.name as string)
  );

  for (const declaration of declarations) {
    if (declaration.defaultImport && !/^[A-Z][A-Za-z0-9_]*$/.test(declaration.defaultImport)) {
      diagnostics.error(
        'VX_COMPONENT_IMPORT_CASE',
        `Visual component import '${declaration.defaultImport}' must begin with an uppercase letter.`,
        declaration.span
      );
    }
    const names = [declaration.defaultImport, ...declaration.specifiers.map((specifier) => specifier.local)].filter(
      (name): name is string => Boolean(name)
    );
    for (const name of names) {
      const previous = locals.get(name);
      if (previous) {
        diagnostics.error(
          'VX_COMPONENT_DUPLICATE_IMPORT',
          `Import binding '${name}' is declared more than once.`,
          declaration.span,
          'Use a unique local alias for every imported component or headless export.'
        );
      }
      if (RESERVED_IMPORT_NAMES.has(name) || UNSAFE_MEMBER_NAMES.has(name)) {
        diagnostics.error(
          'VX_COMPONENT_RESERVED_IMPORT',
          `Import binding '${name}' conflicts with a VX runtime or object-safety identifier.`,
          declaration.span
        );
      }
      if (localDeclarations.has(name)) {
        diagnostics.error(
          'VX_COMPONENT_IMPORT_DECLARATION_CONFLICT',
          `Import binding '${name}' conflicts with a local #script declaration.`,
          declaration.span
        );
      }
      locals.set(name, declaration);
    }
  }

  for (const resolved of module.imports) {
    const target = project.modules.get(resolved.moduleId);
    if (!target) {
      diagnostics.error('VX_COMPONENT_MISSING_MODULE', `Resolved module '${resolved.moduleId}' is missing from the project graph.`, resolved.span);
      continue;
    }
    for (const binding of resolved.bindings) {
      if (binding.imported !== 'default') {
        const exported = target.contract.exports.find((item) => item.name === binding.imported);
        if (exported?.side === 'server' && module.contract.kind === 'component') {
          diagnostics.error(
            'VX_COMPONENT_SERVER_EXPORT_ON_CLIENT',
            `Client component '${module.contract.name}' imports server-only export '${binding.imported}'.`,
            resolved.span,
            'Invoke server behavior through an explicit server action transport instead of importing it into client code.'
          );
        }
      }
    }
  }
}

export function validateHeadlessModule(
  module: ComponentModuleIR,
  script: ScriptBlockNode | undefined,
  view: ReturnType<typeof findViewBlock>,
  diagnostics: DiagnosticCollector
): void {
  if (view) {
    diagnostics.error('VX_HEADLESS_VIEW', `Headless module '${module.contract.name}' cannot declare a #view region.`, view.span);
  }

  for (const statement of script?.statements ?? []) {
    if (
      statement.kind === 'PropDeclaration' ||
      statement.kind === 'OutputDeclaration' ||
      statement.kind === 'ContentDeclaration' ||
      statement.kind === 'VisualPartDeclaration' ||
      statement.kind === 'GenericDeclaration' ||
      statement.kind === 'ModelDeclarationNode' ||
      statement.kind === 'ContextProvideDeclaration' ||
      statement.kind === 'ContextInjectDeclaration' ||
      statement.kind === 'ForwardDeclaration'
    ) {
      diagnostics.error(
        'VX_HEADLESS_COMPONENT_CONTRACT',
        `Headless module '${module.contract.name}' cannot declare '${statement.kind}'.`,
        statement.span,
        'Move component-facing declarations to a visual component, or expose a named headless export.'
      );
    }
    if (statement.kind === 'StateDeclaration' && statement.visibility === 'public') {
      diagnostics.error(
        'VX_HEADLESS_EXPORTED_STATE',
        `Headless module state '${statement.name}' cannot be exported directly.`,
        statement.span,
        'Expose read-only derived values and named actions, or use a store with an explicit lifetime.'
      );
    }
  }

  if (module.contract.exports.length === 0) {
    diagnostics.warning(
      'VX_HEADLESS_NO_EXPORTS',
      `Headless module '${module.contract.name}' exposes no public declarations.`,
      module.ast.span,
      "Mark reusable const, derive, query, action, store, schema, or form declarations with 'export'."
    );
  }
}

