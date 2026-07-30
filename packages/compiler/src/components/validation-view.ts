import type { ComponentContract, ComponentModuleIR, ComponentProjectIR, ContentRegionUseNode, ScriptBlockNode, ViewNode, WidgetNode } from '@vx/types';
import ts from 'typescript';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import { findViewBlock } from './contract.js';
import { buildContractTypeEnvironment, inferExpressionType, isContractTypeAssignable, validateComponentPropTypes } from './contract-types.js';
import { CONTAINER_WIDGETS, CONTROL_WIDGETS, MEDIA_WIDGETS, PRIMITIVE_WIDGETS, SPECIAL_COMPONENT_WIDGETS, TEXT_WIDGETS } from './validation-constants.js';

export function validateEmits(
  contract: ComponentContract,
  script: ScriptBlockNode | undefined,
  diagnostics: DiagnosticCollector
): void {
  const outputs = new Map(contract.outputs.map((output) => [output.name, output]));
  const baseTypes = new Map<string, string>();
  for (const declaration of script?.statements ?? []) {
    if (
      declaration.kind === 'PropDeclaration' ||
      declaration.kind === 'ModelDeclarationNode' ||
      declaration.kind === 'ContextInjectDeclaration' ||
      declaration.kind === 'ConstDeclaration' ||
      declaration.kind === 'StateDeclaration' ||
      declaration.kind === 'DeriveDeclaration'
    ) baseTypes.set(declaration.name, declaration.typeAnnotation.text);
  }

  for (const statement of script?.statements ?? []) {
    if (statement.kind !== 'ActionDeclaration' && statement.kind !== 'EffectDeclaration' && statement.kind !== 'LifecycleDirective') continue;
    const expressionTypes = new Map(baseTypes);
    if (statement.kind === 'ActionDeclaration') {
      for (const parameter of statement.parameters) expressionTypes.set(parameter.name, parameter.typeAnnotation?.text ?? 'Unknown');
    }
    const source = ts.createSourceFile('component-body.ts', `function __vx(){${statement.body}}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'emit') {
        if (statement.kind !== 'ActionDeclaration') {
          diagnostics.error(
            'VX_COMPONENT_EMIT_OUTSIDE_ACTION',
            'Component outputs may only be emitted from an action.',
            statement.span,
            'Move the emit call into a named action so mutation and output ordering remain explicit.'
          );
        }
        const nameArgument = node.arguments[0];
        if (!nameArgument || !ts.isStringLiteralLike(nameArgument)) {
          diagnostics.error(
            'VX_COMPONENT_DYNAMIC_OUTPUT',
            'emit() requires a statically named output as its first argument.',
            statement.span,
            'Use emit("outputName", payload). Dynamic output names are not allowed.'
          );
        } else {
          const output = outputs.get(nameArgument.text);
          if (!output) {
            diagnostics.error(
              'VX_COMPONENT_UNKNOWN_OUTPUT',
              `Output '${nameArgument.text}' is not declared by this component.`,
              statement.span
            );
          } else if (output.type === 'Void' && node.arguments.length > 1) {
            diagnostics.error(
              'VX_COMPONENT_VOID_OUTPUT_PAYLOAD',
              `Output '${output.name}' has type Void and cannot emit a payload.`,
              statement.span
            );
          } else if (output.type !== 'Void' && node.arguments.length < 2) {
            diagnostics.error(
              'VX_COMPONENT_MISSING_OUTPUT_PAYLOAD',
              `Output '${output.name}' requires a payload of type '${output.type}'.`,
              statement.span
            );
          } else if (output.type !== 'Void' && node.arguments[1]) {
            const actual = inferExpressionType(node.arguments[1].getText(source), expressionTypes);
            if (actual !== 'Unknown' && !isContractTypeAssignable(actual, output.type)) {
              diagnostics.error(
                'VX_COMPONENT_OUTPUT_TYPE',
                `Output '${output.name}' expects '${output.type}', but emit() supplies '${actual}'.`,
                statement.span
              );
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

export function validateComponentView(
  module: ComponentModuleIR,
  project: ComponentProjectIR,
  diagnostics: DiagnosticCollector
): void {
  const components = new Map<string, ComponentContract>();
  const typeEnvironment = buildContractTypeEnvironment(module, project);
  for (const imported of module.imports) {
    const target = project.modules.get(imported.moduleId);
    if (!target) continue;
    for (const binding of imported.bindings) {
      if (binding.imported === 'default') components.set(binding.local, target.contract);
    }
  }

  const walk = (node: ViewNode): void => {
    if (node.kind === 'Widget') {
      if (node.tagName === 'Content') {
        validateContentOutletNode(module.contract, node, diagnostics);
      } else if (node.tagName === 'Dynamic') {
        validateDynamicComponent(node, diagnostics);
      } else if (node.tagName === 'Portal') {
        validatePortal(node, diagnostics);
      } else {
        const contract = components.get(node.tagName);
        if (contract) validateComponentUse(node, contract, typeEnvironment, diagnostics);
      }
      node.children.forEach(walk);
      node.contentRegions.forEach((region) => region.children.forEach(walk));
      return;
    }
    if (node.kind === 'IfBlock') node.branches.forEach((branch) => branch.children.forEach(walk));
    if (node.kind === 'WhenBlock') {
      node.branches.forEach((branch) => branch.children.forEach(walk));
      node.fallback?.forEach(walk);
    }
    if (node.kind === 'KeyedCollection') {
      node.children.forEach(walk);
      node.fallbacks.forEach((branch) => branch.children.forEach(walk));
    }
  };

  findViewBlock(module.ast)?.children.forEach(walk);
}

function validateComponentUse(
  node: WidgetNode,
  contract: ComponentContract,
  typeEnvironment: ReadonlyMap<string, string>,
  diagnostics: DiagnosticCollector
): void {
  if (node.roles.length > 0 && !contract.parts.some((part) => part.name === 'root')) {
    diagnostics.error(
      'VX_COMPONENT_ROOT_PART_REQUIRED',
      `Component '${node.tagName}' receives a root visual role but does not expose part 'root'.`,
      node.span,
      "Declare 'part root: container' and attach @part(name: root) to the component root node."
    );
  }
  const props = new Map(contract.props.map((prop) => [prop.name, prop]));
  const outputs = new Set(contract.outputs.map((output) => output.name));
  const suppliedProps = new Set<string>();

  if (node.isCall && node.callArgument) {
    const candidates = contract.props.filter((prop) => prop.required);
    if (candidates.length !== 1) {
      diagnostics.error(
        'VX_COMPONENT_AMBIGUOUS_CALL_ARGUMENT',
        `Component '${node.tagName}' uses call syntax, but its contract does not have exactly one required prop.`,
        node.callArgument.span,
        'Use named prop bindings inside the component body.'
      );
    } else {
      suppliedProps.add(candidates[0]!.name);
    }
  }

  for (const property of node.properties) {
    if (property.kind === 'EventBinding') {
      if (!outputs.has(property.name) && !contract.forwarding.events) {
        diagnostics.error(
          'VX_COMPONENT_UNKNOWN_OUTPUT_BINDING',
          `Component '${node.tagName}' does not expose output '${property.name}' and does not forward events.`,
          property.span
        );
      }
      continue;
    }
    if (!props.has(property.name)) {
      const forwarded = property.name === 'ref' ||
        (property.name === 'class' && contract.forwarding.class) ||
        (property.name === 'style' && contract.forwarding.style) ||
        (property.name !== 'class' && property.name !== 'style' && contract.forwarding.attributes);
      if (!forwarded) {
        diagnostics.error(
          'VX_COMPONENT_UNKNOWN_PROP',
          `Component '${node.tagName}' does not declare prop '${property.name}' or a matching forwarding capability.`,
          property.span
        );
      }
      continue;
    }
    if (suppliedProps.has(property.name)) {
      diagnostics.error(
        'VX_COMPONENT_DUPLICATE_PROP',
        `Prop '${property.name}' is supplied more than once to component '${node.tagName}'.`,
        property.span
      );
    }
    suppliedProps.add(property.name);
  }

  for (const prop of contract.props) {
    if (prop.required && !suppliedProps.has(prop.name)) {
      diagnostics.error(
        'VX_COMPONENT_REQUIRED_PROP',
        `Required prop '${prop.name}: ${prop.type}' is missing from component '${node.tagName}'.`,
        node.span
      );
    }
  }

  validateComponentPropTypes(
    node,
    new Map(contract.props.map((prop) => [prop.name, prop.type])),
    typeEnvironment,
    diagnostics,
    contract.generics
  );
  validateContentBindings(node, contract, diagnostics);
  validatePartBindings(node, contract, diagnostics);
}

function validateDynamicComponent(node: WidgetNode, diagnostics: DiagnosticCollector): void {
  if (!node.isCall || !node.callArgument) {
    diagnostics.error(
      'VX_COMPONENT_DYNAMIC_TARGET',
      'Dynamic requires one component factory expression, such as Dynamic(activeComponent).',
      node.span
    );
  }
  if (node.publicPart || node.forwardTarget) {
    diagnostics.error(
      'VX_COMPONENT_DYNAMIC_MARKER',
      'Dynamic cannot expose @part or @forward markers because its concrete root is selected at runtime.',
      node.span
    );
  }
}

function validatePortal(node: WidgetNode, diagnostics: DiagnosticCollector): void {
  if (!node.isCall || !node.callArgument) {
    diagnostics.error(
      'VX_COMPONENT_PORTAL_TARGET',
      'Portal requires one DOM target expression, such as Portal(document.body).',
      node.span
    );
  }
  if (node.properties.length > 0) {
    diagnostics.error(
      'VX_COMPONENT_PORTAL_PROPERTIES',
      'Portal does not accept props or event bindings; place them on its child nodes.',
      node.span
    );
  }
  if (node.contentRegions.length > 0 || node.publicPart || node.forwardTarget) {
    diagnostics.error(
      'VX_COMPONENT_PORTAL_CONTRACT',
      'Portal accepts only default child content and cannot expose parts or forwarding targets.',
      node.span
    );
  }
}

function validateContentBindings(
  node: WidgetNode,
  contract: ComponentContract,
  diagnostics: DiagnosticCollector
): void {
  const declared = new Map(contract.content.map((region) => [region.name, region]));
  const supplied = new Map<string, ContentRegionUseNode[]>();
  const explicit = [...node.contentRegions];
  if (node.children.length > 0) {
    explicit.push({ kind: 'ContentRegionUse', name: 'default', children: node.children, span: node.span });
  }

  for (const region of explicit) {
    if (!declared.has(region.name)) {
      diagnostics.error(
        'VX_COMPONENT_UNKNOWN_CONTENT_REGION',
        `Component '${node.tagName}' does not declare content region '${region.name}'.`,
        region.span
      );
      continue;
    }
    const entries = supplied.get(region.name) ?? [];
    entries.push(region);
    supplied.set(region.name, entries);
  }

  for (const region of contract.content) {
    const count = supplied.get(region.name)?.length ?? 0;
    if (region.cardinality === 'required' && count === 0) {
      diagnostics.error(
        'VX_COMPONENT_REQUIRED_CONTENT',
        `Component '${node.tagName}' requires content region '${region.name}'.`,
        node.span
      );
    }
    if (region.cardinality !== 'multiple' && count > 1) {
      diagnostics.error(
        'VX_COMPONENT_CONTENT_CARDINALITY',
        `Content region '${region.name}' on '${node.tagName}' accepts only one provider.`,
        supplied.get(region.name)?.[1]?.span ?? node.span
      );
    }
  }
}

function validatePartBindings(
  node: WidgetNode,
  contract: ComponentContract,
  diagnostics: DiagnosticCollector
): void {
  const declared = new Set(contract.parts.map((part) => part.name));
  const seen = new Set<string>();
  for (const binding of node.partBindings) {
    if (!declared.has(binding.name)) {
      diagnostics.error(
        'VX_COMPONENT_UNKNOWN_VISUAL_PART',
        `Component '${node.tagName}' does not expose visual part '${binding.name}'.`,
        binding.span
      );
    }
    if (seen.has(binding.name)) {
      diagnostics.error(
        'VX_COMPONENT_DUPLICATE_VISUAL_PART_BINDING',
        `Visual part '${binding.name}' is bound more than once on component '${node.tagName}'.`,
        binding.span
      );
    }
    seen.add(binding.name);
  }
}

export function validatePublicPartMarkers(
  contract: ComponentContract,
  nodes: readonly ViewNode[],
  diagnostics: DiagnosticCollector
): void {
  const declared = new Map(contract.parts.map((part) => [part.name, part]));
  const seen = new Map<string, WidgetNode>();

  walkWidgets(nodes, (widget) => {
    if (!widget.publicPart) return;
    const part = declared.get(widget.publicPart);
    if (!part) {
      diagnostics.error(
        'VX_COMPONENT_UNDECLARED_PART_MARKER',
        `View node exposes visual part '${widget.publicPart}', but the component contract does not declare it.`,
        widget.span
      );
    } else if (!isCompatiblePartWidget(part.partType, widget.tagName)) {
      diagnostics.error(
        'VX_COMPONENT_PART_TYPE_MISMATCH',
        `Visual part '${part.name}' expects '${part.partType}', but it is attached to '${widget.tagName}'.`,
        widget.span
      );
    }
    if (seen.has(widget.publicPart)) {
      diagnostics.error(
        'VX_COMPONENT_DUPLICATE_PART_MARKER',
        `Visual part '${widget.publicPart}' is attached to more than one view node.`,
        widget.span
      );
    }
    seen.set(widget.publicPart, widget);
  });

  for (const part of contract.parts) {
    if (!seen.has(part.name)) {
      diagnostics.error(
        'VX_COMPONENT_MISSING_PART_MARKER',
        `Public visual part '${part.name}' is not attached to any view node.`,
        part.span,
        `Attach @part(name: ${part.name}) to exactly one node in #view.`
      );
    }
  }

  const forwardTargets: WidgetNode[] = [];
  walkWidgets(nodes, (widget) => { if (widget.forwardTarget) forwardTargets.push(widget); });
  const forwardsAnything = Object.values(contract.forwarding).some(Boolean);
  if (!forwardsAnything && forwardTargets.length > 0) {
    for (const target of forwardTargets) diagnostics.error(
      'VX_COMPONENT_UNDECLARED_FORWARD_TARGET',
      '@forward is present, but the component declares no forward capability.',
      target.span
    );
  }
  if (forwardsAnything && forwardTargets.length !== 1) {
    diagnostics.error(
      'VX_COMPONENT_FORWARD_TARGET_COUNT',
      `A component that forwards attributes, events, class, or style must expose exactly one @forward target; found ${forwardTargets.length}.`,
      forwardTargets[0]?.span ?? nodes[0]?.span ?? contract.generics[0]?.span ?? contract.props[0]?.span ?? contract.outputs[0]?.span ?? contract.content[0]?.span ?? contract.parts[0]?.span ?? { filePath: contract.filePath, start: { offset: 0, line: 1, column: 1 }, end: { offset: 0, line: 1, column: 1 } }
    );
  }
  for (const target of forwardTargets) {
    if (!PRIMITIVE_WIDGETS.has(target.tagName) || SPECIAL_COMPONENT_WIDGETS.has(target.tagName)) {
      diagnostics.error(
        'VX_COMPONENT_INVALID_FORWARD_TARGET',
        `@forward must be attached to one native VX primitive, not '${target.tagName}'.`,
        target.span
      );
    }
  }
}

export function validateContentOutlets(
  contract: ComponentContract,
  nodes: readonly ViewNode[],
  diagnostics: DiagnosticCollector
): void {
  const declared = new Set(contract.content.map((region) => region.name));
  const seen = new Set<string>();
  walkWidgets(nodes, (widget) => {
    if (widget.tagName !== 'Content') return;
    const name = contentOutletName(widget);
    if (!name) return;
    if (!declared.has(name)) {
      diagnostics.error(
        'VX_COMPONENT_UNDECLARED_CONTENT_OUTLET',
        `Content outlet '${name}' is not declared by the component contract.`,
        widget.span
      );
    }
    seen.add(name);
  });
  for (const region of contract.content) {
    if (!seen.has(region.name)) {
      diagnostics.warning(
        'VX_COMPONENT_UNUSED_CONTENT_REGION',
        `Content region '${region.name}' is declared but never rendered by Content(${region.name}).`,
        region.span
      );
    }
  }
}

function validateContentOutletNode(
  contract: ComponentContract,
  node: WidgetNode,
  diagnostics: DiagnosticCollector
): void {
  const name = contentOutletName(node);
  if (!name) {
    diagnostics.error(
      'VX_COMPONENT_CONTENT_OUTLET_NAME',
      'Content() requires one static region name.',
      node.span,
      'Use Content(header) or Content("header").'
    );
  } else if (!contract.content.some((region) => region.name === name)) {
    diagnostics.error(
      'VX_COMPONENT_UNDECLARED_CONTENT_OUTLET',
      `Content outlet '${name}' is not declared by the component contract.`,
      node.span
    );
  }
  if (node.properties.length || node.children.length || node.roles.length || node.contentRegions.length || node.partBindings.length) {
    diagnostics.error(
      'VX_COMPONENT_CONTENT_OUTLET_SHAPE',
      'Content() is a projection outlet and cannot declare props, events, roles, children, nested regions, or part bindings.',
      node.span
    );
  }
}

function contentOutletName(node: WidgetNode): string | undefined {
  const value = node.callArgument?.text.trim();
  if (!value) return undefined;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const unquoted = value.slice(1, -1);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(unquoted) ? unquoted : undefined;
  }
  return undefined;
}

function isCompatiblePartWidget(partType: ComponentContract['parts'][number]['partType'], widgetName: string): boolean {
  if (partType === 'any') return true;
  if (partType === 'container') return CONTAINER_WIDGETS.has(widgetName);
  if (partType === 'text') return TEXT_WIDGETS.has(widgetName);
  if (partType === 'control') return CONTROL_WIDGETS.has(widgetName);
  return MEDIA_WIDGETS.has(widgetName);
}

function walkWidgets(nodes: readonly ViewNode[], visit: (widget: WidgetNode) => void): void {
  for (const node of nodes) {
    if (node.kind === 'Widget') {
      visit(node);
      walkWidgets(node.children, visit);
      for (const region of node.contentRegions) walkWidgets(region.children, visit);
    } else if (node.kind === 'IfBlock') {
      for (const branch of node.branches) walkWidgets(branch.children, visit);
    } else if (node.kind === 'WhenBlock') {
      for (const branch of node.branches) walkWidgets(branch.children, visit);
      if (node.fallback) walkWidgets(node.fallback, visit);
    } else if (node.kind === 'KeyedCollection') {
      walkWidgets(node.children, visit);
      for (const branch of node.fallbacks) walkWidgets(branch.children, visit);
    }
  }
}
