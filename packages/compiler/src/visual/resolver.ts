import type {
  ExpressionNode,
  SourceSpan,
  ViewBlockNode,
  ViewNode,
  VisualDesignRoleDefinition,
  VisualDesignSystem,
  VisualKeyframeStepNode,
  VisualPseudoBlockNode,
  VisualSelectorBlockNode,
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
import { getBuiltinRole, STRUCTURAL_ROLE_NAMES } from './catalog.js';
import { resolveCondition } from './resolver-media.js';
import { isSupportedVisualProperty, visualPropertyToCss, UNSAFE_VALUE_SENTINEL } from './properties.js';
import { collectKeyframeBlocks, emitPseudoRules, emitSelectorRules, emitThemeCss, emitVisualCss, registerKeyframes, resetKeyframesForScope } from './resolver-css.js';

interface RoleMaterial {
  name: string;
  category: VisualRoleCategory;
  properties: VisualRolePropertyNode[];
  states: Array<{
    condition: VisualResolvedCondition;
    properties: VisualRolePropertyNode[];
  }>;
  sources: string[];
  extraCss: string[];
  argumentMap: Record<string, string>;
  keyframes?: VisualKeyframeStepNode[];
  pseudos?: VisualPseudoBlockNode[];
  selectors?: VisualSelectorBlockNode[];
  rawCss?: string;
}

export function resolveVisualProgram(
  view: ViewBlockNode,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector,
  designSystem?: VisualDesignSystem,
  importedVisualRoles?: Map<string, VisualRoleDeclarationNode>
): VisualProgramIR {
  const scopeId = `vx-${hashContent(`${view.span.filePath}:${view.span.start.offset}:${view.span.end.offset}`, 10)}`;
  resetKeyframesForScope(scopeId);
  const localRoles = new Map(view.roles.map((role) => [role.name, role]));

  // Validate duplicate exports within a visual module
  const exportedNames = new Set<string>();
  for (const role of view.roles) {
    if (!role.exported) continue;
    if (exportedNames.has(role.name)) {
      diagnostics.error(
        'VX_VISUAL_DUPLICATE_EXPORT',
        `Role '@${role.name}' is exported more than once in this visual module.`,
        role.span,
        'Each role name must be unique within a visual module.'
      );
    }
    exportedNames.add(role.name);
  }

  // Build the merged role lookup: builtin → design system → imported → local
  // Imported roles are injected as an overlay on top of the design system
  // so local roles in the consuming file still take highest precedence.
  const effectiveDesignSystem: VisualDesignSystem | undefined = importedVisualRoles && importedVisualRoles.size > 0
    ? mergeImportedRolesIntoDesignSystem(designSystem, importedVisualRoles)
    : designSystem;

  validateCompositions(localRoles, diagnostics, effectiveDesignSystem);

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
          ...(partStructuralUse ? { structural: resolveUse(partStructuralUse, 'structural', localRoles, graph, diagnostics, effectiveDesignSystem, scopeId) } : {}),
          ...(partSemanticUse ? { semantic: resolveUse(partSemanticUse, 'semantic', localRoles, graph, diagnostics, effectiveDesignSystem, scopeId) } : {}),
          classNames: binding.roles.length > 0 ? [partClassName] : []
        };
      });
      const classProp = node.properties.find((prop) => prop.kind === 'PropBinding' && (prop.name === 'class' || prop.name === 'className'));
      let customClasses: string[] = [];
      if (classProp && classProp.kind === 'PropBinding') {
        const text = classProp.expression.text.trim();
        if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
          customClasses = text.slice(1, -1).split(/\s+/).filter(Boolean);
        } else {
          const stringLiterals = text.match(/["']([^"']+)["']/g);
          if (stringLiterals) {
            for (const literal of stringLiterals) {
              customClasses.push(...literal.slice(1, -1).split(/\s+/).filter(Boolean));
            }
          }
        }
      }
      const resolved: VisualResolvedNode = {
        id: className,
        widget: node,
        ...(structuralUse ? { structural: resolveUse(structuralUse, 'structural', localRoles, graph, diagnostics, effectiveDesignSystem, scopeId) } : {}),
        ...(semanticUse ? { semantic: resolveUse(semanticUse, 'semantic', localRoles, graph, diagnostics, effectiveDesignSystem, scopeId) } : {}),
        classNames: node.roles.length > 0 ? [className, ...customClasses] : [...customClasses],
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

  const cssText = [emitThemeCss(effectiveDesignSystem), emitVisualCss(scopeId, nodes, diagnostics)].filter(Boolean).join('\n');
  const keyframeBlocks = collectKeyframeBlocks(scopeId, nodes);
  const roleNames = Array.from(new Set(nodes.flatMap((node) => [
    node.structural?.name,
    node.semantic?.name,
    ...node.parts.flatMap((part) => [part.structural?.name, part.semantic?.name])
  ].filter(Boolean) as string[]))).sort();
  const fullCss = [...keyframeBlocks, cssText].filter(Boolean).join('\n');
  const styleChunks = fullCss ? [{ id: `${scopeId}:component`, layer: 'components', cssText: fullCss, critical: true, dependencies: [] }] : [];
  return { scopeId, nodes, cssText: fullCss, roleNames, styleChunks, ...(keyframeBlocks.length > 0 ? { keyframeBlocks } : {}) };
}

function resolveUse(
  use: VisualRoleUseNode,
  expectedCategory: VisualRoleCategory,
  localRoles: Map<string, VisualRoleDeclarationNode>,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector,
  designSystem: VisualDesignSystem | undefined,
  scopeId: string
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

  const keyframesName = material.keyframes?.length
    ? registerKeyframes(scopeId, use.name, material.keyframes, diagnostics)
    : undefined;

  return {
    name: use.name,
    category: material.category,
    properties: resolvedProperties,
    states,
    sources: material.sources,
    ...(keyframesName ? { keyframesName } : {}),
    ...(material.pseudos?.length ? { pseudoRules: emitPseudoRules(use.name, material.pseudos, diagnostics) } : {}),
    ...(material.selectors?.length ? { selectorRules: emitSelectorRules(use.name, material.selectors, diagnostics) } : {}),
    ...(material.rawCss ? { rawCss: material.rawCss } : {}),
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

  return {
    name,
    category,
    properties,
    states: mergeStates(states),
    sources,
    extraCss,
    argumentMap,
    // Propagate advanced visual fields from the local declaration
    ...(local?.keyframes?.length ? { keyframes: local.keyframes } : {}),
    ...(local?.pseudos?.length ? { pseudos: local.pseudos } : {}),
    ...(local?.selectors?.length ? { selectors: local.selectors } : {}),
    ...(local?.rawCss ? { rawCss: local.rawCss } : {}),
  };
}

function validateVisualProperty(property: VisualRolePropertyNode, diagnostics: DiagnosticCollector): void {
  if (!isSupportedVisualProperty(property.name)) {
    diagnostics.error(
      'VX_VISUAL_UNKNOWN_PROPERTY',
      `Visual property '${property.name}' is not part of the VX visual vocabulary.`,
      property.span,
      'Use a typed VX visual property or extend the target through an explicit integration.'
    );
    return;
  }
  // Pre-validate the value to detect unsafe raw values early
  const declarations = visualPropertyToCss(property.name, property.expression.text);
  if (declarations) {
    for (const decl of declarations) {
      if (decl.value === UNSAFE_VALUE_SENTINEL) {
        diagnostics.error(
          'VX_VISUAL_UNSAFE_VALUE',
          `Visual property '${property.name}' contains a value that cannot be safely emitted: ${property.expression.text}.`,
          property.span,
          "Use css { \"...\" } for arbitrary CSS values that cannot be expressed through VX visual properties."
        );
        break;
      }
    }
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


/**
 * Converts imported VisualRoleDeclarationNodes into VisualDesignRoleDefinition entries
 * and merges them into the effective design system so the existing materializeRole
 * pipeline can resolve them without changes to its core logic.
 *
 * Precedence: builtin → design system → imported visual roles → local
 * Imported roles sit between the design system and local roles, so local
 * declarations in the consuming component always win.
 */
function mergeImportedRolesIntoDesignSystem(
  designSystem: VisualDesignSystem | undefined,
  importedRoles: Map<string, VisualRoleDeclarationNode>
): VisualDesignSystem {
  const importedDesignRoles: Record<string, VisualDesignRoleDefinition> = {};

  for (const [name, declaration] of importedRoles) {
    const properties: Record<string, string> = {};
    for (const property of declaration.properties) {
      properties[property.name] = property.expression.text;
    }
    const states: Record<string, Record<string, string>> = {};
    for (const state of declaration.states) {
      const stateProperties: Record<string, string> = {};
      for (const property of state.properties) {
        stateProperties[property.name] = property.expression.text;
      }
      states[state.condition.name] = stateProperties;
    }
    importedDesignRoles[name] = {
      category: 'semantic',
      properties,
      ...(Object.keys(states).length > 0 ? { states } : {}),
      uses: declaration.uses
    };
  }

  return {
    name: designSystem?.name ?? '__imported__',
    ...(designSystem?.tokens !== undefined ? { tokens: designSystem.tokens } : {}),
    ...(designSystem?.modes !== undefined ? { modes: designSystem.modes } : {}),
    ...(designSystem?.breakpoints !== undefined ? { breakpoints: designSystem.breakpoints } : {}),
    roles: {
      ...designSystem?.roles,
      ...importedDesignRoles
    }
  };
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


function makeProperty(name: string, value: string, span: SourceSpan): VisualRolePropertyNode {
  return { kind: 'VisualRoleProperty', name, expression: expression(value, span), span };
}

function expression(text: string, span: SourceSpan): ExpressionNode {
  return { kind: 'Expression', text, span };
}

function conditionKey(condition: VisualResolvedCondition): string {
  return `${condition.name}:${condition.arguments.map((argument) => `${argument.name ?? ''}=${argument.expression.text}`).join(',')}`;
}


// ─── CSS pseudo-element name map ─────────────────────────────────────────────


// ─── Selector combinator → CSS combinator map ────────────────────────────────


/**
 * Emits the main CSS block for all resolved nodes in the component scope.
 * Handles base properties, state conditions, pseudo-elements, relational
 * selectors, and raw CSS escape hatches per node.
 */


/**
 * Collects all @keyframes blocks from resolved nodes.
 * Deduplicates by keyframes name within the scope.
 * Emits VX_VISUAL_DUPLICATE_KEYFRAME when the same name appears more than once.
 */


// Side-channel registry: scopeId-roleName → { name, steps }


/**
 * Registers keyframe steps for a role so collectKeyframeBlocks can emit them.
 * Called from resolveUse when a role has keyframes.
 */


/**
 * Emits CSS rules for pseudo-element blocks.
 * Uses '__SELECTOR__' as a placeholder replaced at emit time.
 */


/**
 * Emits CSS rules for relational selector blocks.
 * Uses '__SELECTOR__' as a placeholder replaced at emit time.
 */

