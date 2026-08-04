import type {
  ComponentContract,
  ComponentModuleKind,
  HeadlessExportContract,
  ProgramNode,
  ScriptBlockNode,
  ViewBlockNode,
  VisualRoleExport
} from '@vx-foundation/types';
import { hashContent } from '@vx-foundation/shared';

/** Extracts the immutable public contract of one parsed VX module. */
export function extractComponentContract(program: ProgramNode): ComponentContract {
  const script = findScriptBlock(program);
  const view = findViewBlock(program);
  const kind: ComponentModuleKind = classifyModule(program, view);
  const name = componentName(program.filePath);

  const generics: ComponentContract['generics'] = [];
  const props: ComponentContract['props'] = [];
  const outputs: ComponentContract['outputs'] = [];
  const content: ComponentContract['content'] = [];
  const parts: ComponentContract['parts'] = [];
  const forwarding: ComponentContract['forwarding'] = { attributes: false, events: false, class: false, style: false };
  const exports: HeadlessExportContract[] = [];

  for (const statement of script?.statements ?? []) {
    switch (statement.kind) {
      case 'GenericDeclaration':
        generics.push({ name: statement.name, ...(statement.constraint ? { constraint: statement.constraint.text } : {}), span: statement.span });
        break;
      case 'ModelDeclarationNode':
        props.push({
          name: statement.name,
          type: statement.typeAnnotation.text,
          required: false,
          defaultExpression: statement.defaultValue.text,
          side: statement.side,
          model: true,
          modelOutput: statement.outputName,
          span: statement.span
        });
        outputs.push({ name: statement.outputName, type: statement.typeAnnotation.text, span: statement.span });
        break;
      case 'ForwardDeclaration':
        forwarding[statement.name] = true;
        break;
      case 'PropDeclaration':
        props.push({
          name: statement.name,
          type: statement.typeAnnotation.text,
          required: !statement.defaultValue && !isOptionalType(statement.typeAnnotation.text),
          ...(statement.defaultValue ? { defaultExpression: statement.defaultValue.text } : {}),
          side: statement.side,
          span: statement.span
        });
        break;
      case 'OutputDeclaration':
        outputs.push({ name: statement.name, type: statement.typeAnnotation.text, span: statement.span });
        break;
      case 'ContentDeclaration':
        content.push({ name: statement.name, cardinality: statement.cardinality, span: statement.span });
        break;
      case 'VisualPartDeclaration':
        parts.push({ name: statement.name, partType: statement.partType, span: statement.span });
        break;
      case 'ConstDeclaration':
      case 'DeriveDeclaration':
      case 'QueryDeclaration':
      case 'ActionDeclaration':
      case 'StoreDeclaration':
      case 'SchemaDeclaration':
      case 'FormDeclaration':
        if (statement.visibility === 'public') exports.push(toHeadlessExport(statement));
        break;
      default:
        break;
    }
  }

  // Collect exported visual roles from the #view block (only for visual modules)
  const visualExports: VisualRoleExport[] = [];
  if (kind === 'visual' && view) {
    for (const role of view.roles) {
      if (role.exported) {
        visualExports.push({ name: role.name, declaration: role, span: role.span });
      }
    }
  }

  return {
    id: `vx:${hashContent(program.filePath, 16)}`,
    name,
    filePath: program.filePath,
    kind,
    generics,
    props,
    outputs,
    content,
    parts,
    forwarding,
    exports,
    visualExports
  };
}

export function findScriptBlock(program: ProgramNode): ScriptBlockNode | undefined {
  return program.blocks.find((block): block is ScriptBlockNode => block.kind === 'ScriptBlock');
}

export function findViewBlock(program: ProgramNode): ViewBlockNode | undefined {
  return program.blocks.find((block): block is ViewBlockNode => block.kind === 'ViewBlock');
}

/**
 * Classifies a parsed VX module into one of three kinds:
 * - 'component': has a #view with widgets (the default for visual files)
 * - 'visual': has a #view with only exported roles and no widgets
 * - 'headless': has no #view at all
 */
export function classifyModule(program: ProgramNode, view: ViewBlockNode | undefined): ComponentModuleKind {
  if (!view) return 'headless';
  // A visual module: #view contains no widgets, has at least one exported role,
  // and all roles at the top level are exported.
  const hasWidgets = view.children.length > 0;
  const exportedRoles = view.roles.filter((role) => role.exported);
  const allExported = view.roles.length > 0 && view.roles.every((role) => role.exported);
  if (!hasWidgets && exportedRoles.length > 0 && allExported) return 'visual';
  return 'component';
}

function componentName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const base = normalized.slice(normalized.lastIndexOf('/') + 1);
  return base.endsWith('.vx') ? base.slice(0, -3) || 'AnonymousComponent' : base || 'AnonymousComponent';
}

function isOptionalType(type: string): boolean {
  return /^Optional\s*</.test(type.trim());
}

function toHeadlessExport(
  statement: Extract<
    NonNullable<ReturnType<typeof findScriptBlock>>['statements'][number],
    { kind: 'ConstDeclaration' | 'DeriveDeclaration' | 'QueryDeclaration' | 'ActionDeclaration' | 'StoreDeclaration' | 'SchemaDeclaration' | 'FormDeclaration' }
  >
): HeadlessExportContract {
  switch (statement.kind) {
    case 'ConstDeclaration':
      return { name: statement.name, kind: 'const', type: statement.typeAnnotation.text, reactive: false, side: statement.side, span: statement.span };
    case 'DeriveDeclaration':
      return { name: statement.name, kind: 'derive', type: statement.typeAnnotation.text, reactive: true, side: statement.side, span: statement.span };
    case 'QueryDeclaration':
      return { name: statement.name, kind: 'query', reactive: true, side: statement.side, span: statement.span };
    case 'ActionDeclaration':
      return {
        name: statement.name,
        kind: 'action',
        ...(statement.returnType ? { type: statement.returnType.text } : {}),
        reactive: false,
        side: statement.side,
        span: statement.span
      };
    case 'SchemaDeclaration':
      return { name: statement.name, kind: 'schema', type: statement.name, reactive: false, side: statement.side, span: statement.span };
    case 'FormDeclaration':
      return { name: statement.name, kind: 'form', type: statement.schemaName, reactive: true, side: statement.side, span: statement.span };
    case 'StoreDeclaration':
      return {
        name: statement.name,
        kind: 'store',
        lifetime: statement.lifetime,
        reactive: true,
        side: statement.side,
        span: statement.span
      };
  }
}
