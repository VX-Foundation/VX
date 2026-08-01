import type {
  ExpressionNode,
  SourceSpan,
  ViewBlockNode,
  ViewNode,
  VisualConditionArgumentNode,
  VisualDesignSystem,
  VisualProgramIR,
  VisualResolvedCondition,
  VisualResolvedNode,
  VisualResolvedPartBinding,
  VisualResolvedProperty,
  VisualResolvedRole,
  VisualResolvedState,
  VisualRoleCategory,
  VisualRoleDeclarationNode,
  VisualRolePropertyNode,
  VisualRoleUseNode
} from '@vx-foundation/types';
import { hashContent } from '@vx-foundation/shared';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import type { ReactiveGraph } from '../analyze/graph-builder.js';
import { collectReferencedIdentifiers } from '../analyze/expression-identifiers.js';
import { BUILTIN_ROLES, getBuiltinRole, STRUCTURAL_ROLE_NAMES } from './catalog.js';
import { isSupportedVisualProperty, visualPropertyToCss } from './properties.js';

interface RoleMaterial {
  name: string;
  category: VisualRoleCategory;
  properties: VisualRolePropertyNode[];
  states: Array<{ condition: VisualResolvedCondition; properties: VisualRolePropertyNode[] }>;
  sources: string[];
  extraCss: string[];
  argumentMap: Readonly<Record<string, string>>;
}

const CONDITION_NAMES = new Set([
  'hover', 'pressed', 'focus', 'focusVisible', 'disabled', 'selected', 'checked',
  'expanded', 'invalid', 'loading', 'dark', 'light', 'motion', 'viewport',
  'container', 'orientation', 'contrast', 'pointer'
]);

export function resolveVisualProgram(
  view: ViewBlockNode,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector,
  designSystem?: VisualDesignSystem
): VisualProgramIR {
  const scopeId = `vx-${hashContent(`${view.span.filePath}:${view.span.start.offset}:${view.span.end.offset}`, 10)}`;
  const localRoles = new Map(view.roles.map((role) => [role.name, role]));
  validateCompositions(localRoles, diagnostics, designSystem);

  const nodes: VisualResolvedNode[] = [];
  let nodeIndex = 0;

  const walk = (node: ViewNode): void => {
    if (node.kind === 'Widget') {
      const structuralUse = node.roles.find((role) => STRUCTURAL_ROLE_NAMES.has(role.name));
      const semanticUse = node.roles.find((role) => !STRUCTURAL_ROLE_NAMES.has(role.name));
      const className = `${scopeId}-${nodeIndex++}`;
      const parts: VisualResolvedPartBinding[] = node.partBindings.map((binding) => {
        const partStructuralUse = binding.roles.find((role) => STRUCTURAL_ROLE_NAMES.has(role.name));
        const partSemanticUse = binding.roles.find((role) => !STRUCTURAL_ROLE_NAMES.has(role.name));
        const partClassName = `${scopeId}-${nodeIndex++}-part-${binding.name}`;
        return {
          name: binding.name,
          ...(partStructuralUse ? { structural: resolveUse(partStructuralUse, 'structural', localRoles, graph, diagnostics, designSystem) } : {}),
          ...(partSemanticUse ? { semantic: resolveUse(partSemanticUse, 'semantic', localRoles, graph, diagnostics, designSystem) } : {}),
          classNames: binding.roles.length > 0 ? [partClassName] : []
        };
      });
      const resolved: VisualResolvedNode = {
        id: className,
        widget: node,
        ...(structuralUse ? { structural: resolveUse(structuralUse, 'structural', localRoles, graph, diagnostics, designSystem) } : {}),
        ...(semanticUse ? { semantic: resolveUse(semanticUse, 'semantic', localRoles, graph, diagnostics, designSystem) } : {}),
        classNames: node.roles.length > 0 ? [className] : [],
        parts
      };
      nodes.push(resolved);
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
  view.children.forEach(walk);

  const cssText = [emitThemeCss(designSystem), emitVisualCss(scopeId, nodes, diagnostics)].filter(Boolean).join('\n');
  const roleNames = Array.from(new Set(nodes.flatMap((node) => [
    node.structural?.name,
    node.semantic?.name,
    ...node.parts.flatMap((part) => [part.structural?.name, part.semantic?.name])
  ].filter(Boolean) as string[]))).sort();
  const styleChunks = cssText ? [{ id: `${scopeId}:component`, layer: 'components', cssText, critical: true, dependencies: [] }] : [];
  return { scopeId, nodes, cssText, roleNames, styleChunks };
}

function resolveUse(
  use: VisualRoleUseNode,
  expectedCategory: VisualRoleCategory,
  localRoles: Map<string, VisualRoleDeclarationNode>,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector,
  designSystem?: VisualDesignSystem
): VisualResolvedRole {
  const material = materializeRole(use.name, localRoles, diagnostics, [], use.span, designSystem);
  if (!material) {
    diagnostics.error(
      'VX_VISUAL_UNKNOWN_ROLE',
      `Visual role '@${use.name}' is not defined by VX, the design system, or this component.`,
      use.span,
      `Declare '@${use.name} { ... }' at the top level of #view or use a known role.`
    );
    return { name: use.name, category: expectedCategory, properties: [], states: [], sources: [] };
  }

  if (material.category !== expectedCategory) {
    diagnostics.error(
      'VX_VISUAL_ROLE_CATEGORY',
      `Role '@${use.name}' is ${material.category}, but it is being used as ${expectedCategory}.`,
      use.span
    );
  }

  const properties = [...material.properties];
  const seenArgs = new Set<string>();
  for (const argument of use.arguments) {
    if (seenArgs.has(argument.name)) continue;
    seenArgs.add(argument.name);
    const propertyName = material.argumentMap[argument.name];
    if (!propertyName) {
      diagnostics.error(
        'VX_VISUAL_UNKNOWN_ARGUMENT',
        `Role '@${use.name}' does not accept argument '${argument.name}'.`,
        argument.span
      );
      continue;
    }
    properties.push({ kind: 'VisualRoleProperty', name: propertyName, expression: argument.expression, span: argument.span });
  }

  for (const property of properties) validateVisualProperty(property, diagnostics);
  for (const state of material.states) for (const property of state.properties) validateVisualProperty(property, diagnostics);

  const resolvedProperties = mergeResolvedProperties(properties, material.sources.at(-1) ?? use.name, graph);
  const states: VisualResolvedState[] = material.states.map((state) => ({
    condition: state.condition,
    properties: mergeResolvedProperties(state.properties, material.sources.at(-1) ?? use.name, graph)
  }));

  for (const state of states) {
    for (const property of state.properties) {
      if (property.mode === 'dynamic') {
        diagnostics.error(
          'VX_VISUAL_DYNAMIC_STATE_PROPERTY',
          `Visual condition '${state.condition.name}' cannot contain reactive property '${property.name}' in Phase 2.`,
          property.expression.span,
          'Move the reactive choice to the base role property, or express it through a semantic widget state.'
        );
      }
    }
  }

  return {
    name: use.name,
    category: material.category,
    properties: resolvedProperties,
    states,
    sources: material.sources
  };
}

function materializeRole(
  name: string,
  localRoles: Map<string, VisualRoleDeclarationNode>,
  diagnostics: DiagnosticCollector,
  stack: string[],
  span: SourceSpan,
  designSystem?: VisualDesignSystem
): RoleMaterial | null {
  if (stack.includes(name)) {
    diagnostics.error(
      'VX_VISUAL_ROLE_CYCLE',
      `Visual role composition contains a cycle: ${[...stack, name].map((part) => `@${part}`).join(' -> ')}.`,
      span
    );
    return null;
  }

  const builtin = getBuiltinRole(name);
  const external = designSystem?.roles?.[name];
  const local = localRoles.get(name);
  if (!builtin && !external && !local) return null;

  const category: VisualRoleCategory = external?.category ?? builtin?.category ?? 'semantic';
  const properties: VisualRolePropertyNode[] = [];
  const states: Array<{ condition: VisualResolvedCondition; properties: VisualRolePropertyNode[] }> = [];
  const sources: string[] = [];
  const extraCss: string[] = [];
  const argumentMap: Record<string, string> = {};

  if (builtin) {
    sources.push(`builtin:${name}`);
    Object.assign(argumentMap, builtin.arguments ?? {});
    for (const [propertyName, value] of Object.entries(builtin.properties)) {
      properties.push(makeProperty(propertyName, value, span));
    }
    for (const [conditionName, conditionProperties] of Object.entries(builtin.states ?? {})) {
      states.push({
        condition: resolveCondition(conditionName, [], diagnostics, span, designSystem),
        properties: Object.entries(conditionProperties).map(([propertyName, value]) => makeProperty(propertyName, value, span))
      });
    }
    if (builtin.extraCss) extraCss.push(builtin.extraCss);
  }

  if (external) {
    for (const composedName of external.uses ?? []) {
      const composed = materializeRole(composedName, localRoles, diagnostics, [...stack, name], span, designSystem);
      if (!composed) continue;
      if (composed.category !== category) {
        diagnostics.error(
          'VX_VISUAL_ROLE_CATEGORY',
          `Design-system role '@${name}' cannot compose ${composed.category} role '@${composedName}'.`,
          span
        );
        continue;
      }
      properties.push(...composed.properties);
      states.push(...composed.states);
      sources.push(...composed.sources);
      extraCss.push(...composed.extraCss);
      Object.assign(argumentMap, composed.argumentMap);
    }
    for (const [propertyName, value] of Object.entries(external.properties)) {
      properties.push(makeProperty(propertyName, value, span));
    }
    for (const [conditionName, conditionProperties] of Object.entries(external.states ?? {})) {
      states.push({
        condition: resolveCondition(conditionName, [], diagnostics, span, designSystem),
        properties: Object.entries(conditionProperties).map(([propertyName, value]) => makeProperty(propertyName, value, span))
      });
    }
    Object.assign(argumentMap, external.arguments ?? {});
    sources.push(`design:${designSystem?.name ?? 'application'}:${name}`);
  }

  if (local) {
    for (const composedName of local.uses) {
      const composed = materializeRole(composedName, localRoles, diagnostics, [...stack, name], local.span, designSystem);
      if (!composed) continue;
      if (composed.category !== 'semantic') {
        diagnostics.error(
          'VX_VISUAL_HIDDEN_LAYOUT_COMPOSITION',
          `Semantic role '@${name}' cannot compose structural role '@${composedName}'.`,
          local.span,
          'Attach structural capabilities such as @grid directly to the view node.'
        );
        continue;
      }
      properties.push(...composed.properties);
      states.push(...composed.states);
      sources.push(...composed.sources);
      extraCss.push(...composed.extraCss);
      Object.assign(argumentMap, composed.argumentMap);
    }

    properties.push(...local.properties);
    for (const state of local.states) {
      states.push({
        condition: resolveCondition(state.condition.name, state.condition.arguments, diagnostics, state.span, designSystem),
        properties: state.properties
      });
    }
    sources.push(`local:${name}`);
  }

  return { name, category, properties, states: mergeStates(states), sources, extraCss, argumentMap };
}

function validateVisualProperty(property: VisualRolePropertyNode, diagnostics: DiagnosticCollector): void {
  if (!isSupportedVisualProperty(property.name)) {
    diagnostics.error(
      'VX_VISUAL_UNKNOWN_PROPERTY',
      `Visual property '${property.name}' is not part of the VX visual vocabulary.`,
      property.span,
      'Use a typed VX visual property or extend the target through an explicit integration.'
    );
  }
}

function mergeResolvedProperties(
  properties: VisualRolePropertyNode[],
  sourceRole: string,
  graph: ReactiveGraph
): VisualResolvedProperty[] {
  const map = new Map<string, VisualResolvedProperty>();
  for (const property of properties) {
    const references = collectReferencedIdentifiers(property.expression.text);
    const mode = [...references].some((reference) => graph.nodes.has(reference)) ? 'dynamic' : 'static';
    const css = visualPropertyToCss(property.name, property.expression.text);
    const cssName = css?.[0]?.name ?? property.name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    map.set(property.name, {
      name: property.name,
      cssName,
      expression: property.expression,
      mode,
      sourceRole
    });
  }
  return [...map.values()];
}

function mergeStates(
  states: Array<{ condition: VisualResolvedCondition; properties: VisualRolePropertyNode[] }>
): Array<{ condition: VisualResolvedCondition; properties: VisualRolePropertyNode[] }> {
  const map = new Map<string, { condition: VisualResolvedCondition; properties: VisualRolePropertyNode[] }>();
  for (const state of states) {
    const key = conditionKey(state.condition);
    const previous = map.get(key);
    map.set(key, previous ? { condition: state.condition, properties: [...previous.properties, ...state.properties] } : state);
  }
  return [...map.values()];
}

function emitVisualCss(scopeId: string, nodes: VisualResolvedNode[], diagnostics: DiagnosticCollector): string {
  const lines: string[] = [`/* VX Visual IR ${scopeId} */`];

  for (const node of nodes) {
    if (node.classNames.length === 0) continue;
    const selector = `.${node.classNames[0]}`;
    const roles = [node.structural, node.semantic].filter(Boolean) as VisualResolvedRole[];
    const declarations = roles.flatMap((role) => role.properties).filter((property) => property.mode === 'static');
    const css = declarations.flatMap((property) => propertyCss(property, diagnostics));
    // Structural capabilities establish a query container for their descendants.
    // This does not create a wrapper or runtime widget; it is target-level metadata.
    if (node.structural) css.unshift('container-type: inline-size;');
    if (css.length > 0) lines.push(`${selector} { ${css.join(' ')} }`);

    for (const role of roles) {
      for (const state of role.states) {
        const stateCss = state.properties.filter((property) => property.mode === 'static').flatMap((property) => propertyCss(property, diagnostics));
        if (stateCss.length === 0) continue;
        emitConditionRule(lines, selector, state.condition, stateCss.join(' '));
      }
    }

    for (const use of node.widget.roles) {
      const builtin = BUILTIN_ROLES[use.name];
      if (builtin?.extraCss) lines.push(`${selector} ${builtin.extraCss}`);
    }

    for (const part of node.parts) {
      if (part.classNames.length === 0) continue;
      emitResolvedRoleCss(lines, `.${part.classNames[0]}`, [part.structural, part.semantic].filter(Boolean) as VisualResolvedRole[], diagnostics);
    }
  }

  return lines.join('\n');
}

function propertyCss(property: VisualResolvedProperty, diagnostics: DiagnosticCollector): string[] {
  const declarations = visualPropertyToCss(property.name, property.expression.text);
  if (!declarations) {
    diagnostics.error(
      'VX_VISUAL_UNKNOWN_PROPERTY',
      `Visual property '${property.name}' is not part of the VX visual vocabulary.`,
      property.expression.span
    );
    return [];
  }
  return declarations.filter((declaration) => declaration.value !== '').map((declaration) => `${declaration.name}: ${declaration.value};`);
}

function emitResolvedRoleCss(
  lines: string[],
  selector: string,
  roles: VisualResolvedRole[],
  diagnostics: DiagnosticCollector
): void {
  const declarations = roles.flatMap((role) => role.properties).filter((property) => property.mode === 'static');
  const css = declarations.flatMap((property) => propertyCss(property, diagnostics));
  if (roles.some((role) => role.category === 'structural')) css.unshift('container-type: inline-size;');
  if (css.length > 0) lines.push(`${selector} { ${css.join(' ')} }`);
  for (const role of roles) {
    for (const state of role.states) {
      const stateCss = state.properties
        .filter((property) => property.mode === 'static')
        .flatMap((property) => propertyCss(property, diagnostics));
      if (stateCss.length > 0) emitConditionRule(lines, selector, state.condition, stateCss.join(' '));
    }
  }
}

function emitConditionRule(lines: string[], selector: string, condition: VisualResolvedCondition, body: string): void {
  if (condition.selector) {
    const selectors = condition.selector.split(',').map((suffix) => `${selector}${suffix.trim()}`).join(', ');
    lines.push(`${selectors} { ${body} }`);
    return;
  }
  if (condition.media) {
    lines.push(`@media ${condition.media} { ${selector} { ${body} } }`);
    return;
  }
  if (condition.container) {
    lines.push(`@container ${condition.container} { ${selector} { ${body} } }`);
  }
}

function resolveCondition(
  name: string,
  args: VisualConditionArgumentNode[],
  diagnostics: DiagnosticCollector,
  span: SourceSpan,
  designSystem?: VisualDesignSystem
): VisualResolvedCondition {
  if (!CONDITION_NAMES.has(name)) {
    diagnostics.error(
      'VX_VISUAL_UNKNOWN_CONDITION',
      `Unknown visual condition '${name}'.`,
      span,
      'Use an interaction state or a supported environment query.'
    );
    return { name, arguments: args, selector: `[data-vx-state~="${escapeCss(name)}"]` };
  }

  const selectors: Record<string, string> = {
    hover: ':hover', pressed: ':active', focus: ':focus', focusVisible: ':focus-visible',
    disabled: ':disabled,[aria-disabled="true"]', selected: '[aria-selected="true"],[data-vx-state~="selected"]',
    checked: ':checked,[aria-checked="true"]', expanded: '[aria-expanded="true"]', invalid: ':invalid,[aria-invalid="true"]',
    loading: '[aria-busy="true"],[data-vx-state~="loading"]'
  };
  if (selectors[name]) return { name, arguments: args, selector: selectors[name] };
  if (name === 'dark') return { name, arguments: args, media: '(prefers-color-scheme: dark)' };
  if (name === 'light') return { name, arguments: args, media: '(prefers-color-scheme: light)' };
  if (name === 'motion') return { name, arguments: args, media: `(prefers-reduced-motion: ${argValue(args, 'value', 0) === 'reduced' ? 'reduce' : 'no-preference'})` };
  if (name === 'orientation') return { name, arguments: args, media: `(orientation: ${argValue(args, 'value', 0) || 'portrait'})` };
  if (name === 'contrast') return { name, arguments: args, media: `(prefers-contrast: ${argValue(args, 'value', 0) || 'more'})` };
  if (name === 'pointer') return { name, arguments: args, media: `(pointer: ${argValue(args, 'value', 0) || 'fine'})` };
  if (name === 'viewport') return { name, arguments: args, media: dimensionQuery(args, designSystem) };
  if (name === 'container') return { name, arguments: args, container: dimensionQuery(args, designSystem) };
  return { name, arguments: args };
}

function dimensionQuery(args: VisualConditionArgumentNode[], designSystem?: VisualDesignSystem): string {
  const min = argValue(args, 'min');
  const max = argValue(args, 'max');
  const clauses: string[] = [];
  if (min) clauses.push(`(min-width: ${breakpoint(min, designSystem)})`);
  if (max) clauses.push(`(max-width: ${breakpoint(max, designSystem)})`);
  return clauses.join(' and ') || '(min-width: 0px)';
}

function argValue(args: VisualConditionArgumentNode[], name: string, positionalIndex?: number): string {
  const named = args.find((argument) => argument.name === name);
  const positional = positionalIndex === undefined ? undefined : args.filter((argument) => !argument.name)[positionalIndex];
  return stripQuotes((named ?? positional)?.expression.text.trim() ?? '');
}

function breakpoint(value: string, designSystem?: VisualDesignSystem): string {
  const values: Record<string, string> = { xs: '30rem', sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' };
  const configured = designSystem?.breakpoints?.[value];
  if (configured !== undefined) return typeof configured === 'number' ? `${configured}px` : String(configured);
  if (values[value]) return values[value]!;
  if (/^\d+(\.\d+)?$/.test(value)) return `${value}px`;
  return value;
}

function validateCompositions(localRoles: Map<string, VisualRoleDeclarationNode>, diagnostics: DiagnosticCollector, designSystem?: VisualDesignSystem): void {
  for (const role of localRoles.values()) {
    const seen = new Set<string>();
    for (const used of role.uses) {
      if (seen.has(used)) {
        diagnostics.error('VX_VISUAL_DUPLICATE_COMPOSITION', `Role '@${role.name}' composes '@${used}' more than once.`, role.span);
      }
      seen.add(used);
      if (!localRoles.has(used) && !getBuiltinRole(used) && !designSystem?.roles?.[used]) {
        diagnostics.error('VX_VISUAL_UNKNOWN_COMPOSED_ROLE', `Role '@${role.name}' composes unknown role '@${used}'.`, role.span);
      }
    }
  }
}

function emitThemeCss(designSystem?: VisualDesignSystem): string {
  if (!designSystem || (!designSystem.tokens && !designSystem.modes)) return '';
  const selector = `:root, [data-vx-theme=${JSON.stringify(designSystem.name)}]`;
  const lines: string[] = [];
  const base = Object.entries(designSystem.tokens ?? {}).map(([name, value]) => `--vx-theme-${name.replace(/\./g, '-')}: ${String(value)};`).join(' ');
  if (base) lines.push(`${selector} { ${base} }`);
  for (const [mode, tokens] of Object.entries(designSystem.modes ?? {})) {
    const declarations = Object.entries(tokens).map(([name, value]) => `--vx-theme-${name.replace(/\./g, '-')}: ${String(value)};`).join(' ');
    if (mode === 'dark' || mode === 'light') {
      lines.push(`@media (prefers-color-scheme: ${mode}) { ${selector} { ${declarations} } }`);
    } else {
      lines.push(`[data-vx-theme-mode=${JSON.stringify(mode)}] { ${declarations} }`);
    }
  }
  return lines.join('\n');
}

function makeProperty(name: string, value: string, span: SourceSpan): VisualRolePropertyNode {
  return { kind: 'VisualRoleProperty', name, expression: expression(value, span), span };
}

function expression(text: string, span: SourceSpan): ExpressionNode {
  return { kind: 'Expression', text, span };
}

function conditionKey(condition: VisualResolvedCondition): string {
  return `${condition.name}:${condition.arguments.map((argument) => `${argument.name ?? ''}=${argument.expression.text}`).join(',')}`;
}

function stripQuotes(value: string): string {
  return ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value;
}

function escapeCss(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
