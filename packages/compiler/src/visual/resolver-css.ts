import type {
  VisualDesignSystem,
  VisualKeyframeStepNode,
  VisualPseudoBlockNode,
  VisualResolvedCondition,
  VisualResolvedNode,
  VisualResolvedProperty,
  VisualResolvedRole,
  VisualSelectorBlockNode
} from '@vx-foundation/types';

import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import { UNSAFE_VALUE_SENTINEL, visualPropertyToCss } from './properties.js';

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
  const result: string[] = [];
  for (const decl of declarations) {
    if (decl.value === UNSAFE_VALUE_SENTINEL) {
      diagnostics.error(
        'VX_VISUAL_UNSAFE_VALUE',
        `Visual property '${property.name}' contains a value that cannot be safely emitted: ${property.expression.text}.`,
        property.expression.span,
        "Use css { \"...\" } for arbitrary CSS values that cannot be expressed through VX visual properties."
      );
      continue;
    }
    if (decl.value !== '') result.push(`${decl.name}: ${decl.value};`);
  }
  return result;
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

export function emitThemeCss(designSystem?: VisualDesignSystem): string {
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

const PSEUDO_CSS_NAMES: Record<string, string> = {
  before: '::before', after: '::after', placeholder: '::placeholder',
  selection: '::selection', firstLine: '::first-line', firstLetter: '::first-letter',
  marker: '::marker', backdrop: '::backdrop'
};

const SELECTOR_CSS_COMBINATORS: Record<string, (sel: string) => string> = {
  child: (sel) => ` > ${sel}`,
  has: (sel) => `:has(${sel})`,
  not: (sel) => `:not(${sel})`,
  sibling: (sel) => ` ~ ${sel}`,
  adjacent: (sel) => ` + ${sel}`,
  is: (sel) => `:is(${sel})`,
  where: (sel) => `:where(${sel})`
};

export function emitVisualCss(
  _scopeId: string,
  nodes: VisualResolvedNode[],
  diagnostics: DiagnosticCollector
): string {
  const lines: string[] = [];

  for (const node of nodes) {
    if (node.classNames.length === 0) continue;
    const selector = `.${node.classNames[0]}`;
    const roles = [
      ...(node.structural ? [node.structural] : []),
      ...(node.semantic ? [node.semantic] : [])
    ];
    if (roles.length > 0) emitResolvedRoleCss(lines, selector, roles, diagnostics);
    for (const role of roles) {
      if (role.pseudoRules) lines.push(...role.pseudoRules.map((rule) => rule.replace('__SELECTOR__', selector)));
      if (role.selectorRules) lines.push(...role.selectorRules.map((rule) => rule.replace('__SELECTOR__', selector)));
      if (role.rawCss) lines.push(`${selector} { ${role.rawCss} }`);
    }
    for (const part of node.parts) {
      if (part.classNames.length === 0) continue;
      const partSelector = `.${part.classNames[0]}`;
      const partRoles = [
        ...(part.structural ? [part.structural] : []),
        ...(part.semantic ? [part.semantic] : [])
      ];
      if (partRoles.length > 0) emitResolvedRoleCss(lines, partSelector, partRoles, diagnostics);
      for (const role of partRoles) {
        if (role.pseudoRules) lines.push(...role.pseudoRules.map((rule) => rule.replace('__SELECTOR__', partSelector)));
        if (role.selectorRules) lines.push(...role.selectorRules.map((rule) => rule.replace('__SELECTOR__', partSelector)));
        if (role.rawCss) lines.push(`${partSelector} { ${role.rawCss} }`);
      }
    }
  }

  return lines.join('\n');
}

const keyframeRegistry = new Map<string, { name: string; steps: VisualKeyframeStepNode[] }>();

export function resetKeyframesForScope(scopeId: string): void {
  for (const key of [...keyframeRegistry.keys()]) {
    if (key.startsWith(scopeId)) keyframeRegistry.delete(key);
  }
}


export function collectKeyframeBlocks(
  scopeId: string,
  _nodes: VisualResolvedNode[]
): string[] {
  return [...keyframeRegistry.entries()]
    .filter(([key]) => key.startsWith(scopeId))
    .map(([, { name, steps }]) => {
      const body = steps.map((step) => {
        const stop = step.stop === 'from' ? 'from' : step.stop === 'to' ? 'to' : `${step.stop}%`;
        const declarations = step.properties
          .flatMap((p) => visualPropertyToCss(p.name, p.expression.text) ?? [])
          .filter((d) => d.value && d.value !== UNSAFE_VALUE_SENTINEL)
          .map((d) => `${d.name}: ${d.value};`)
          .join(' ');
        return `  ${stop} { ${declarations} }`;
      }).join('\n');
      return `@keyframes ${name} {\n${body}\n}`;
    });
}

export function registerKeyframes(
  scopeId: string,
  roleName: string,
  steps: VisualKeyframeStepNode[],
  diagnostics: DiagnosticCollector
): string {
  const animationName = `${scopeId}-${roleName}`;
  if (keyframeRegistry.has(animationName)) {
    diagnostics.error(
      'VX_VISUAL_DUPLICATE_KEYFRAME',
      `Keyframe animation '${animationName}' is defined more than once in this scope.`,
      steps[0]!.span,
      `Each role can only define one keyframes block. Rename one of the '@${roleName}' roles.`
    );
  } else {
    keyframeRegistry.set(animationName, { name: animationName, steps });
  }
  return animationName;
}

export function emitPseudoRules(
  roleName: string,
  pseudos: VisualPseudoBlockNode[],
  diagnostics: DiagnosticCollector
): string[] {
  const rules: string[] = [];
  for (const pseudo of pseudos) {
    const cssPseudo = PSEUDO_CSS_NAMES[pseudo.pseudo];
    if (!cssPseudo) {
      diagnostics.error(
        'VX_VISUAL_INVALID_PSEUDO',
        `Unknown pseudo-element '${pseudo.pseudo}' in role '@${roleName}'.`,
        pseudo.span,
        `Supported pseudo-elements: ${Object.keys(PSEUDO_CSS_NAMES).join(', ')}.`
      );
      continue;
    }
    const declarations = pseudo.properties
      .flatMap((p) => {
        const css = visualPropertyToCss(p.name, p.expression.text);
        if (!css) return [];
        return css.filter((d) => d.value && d.value !== UNSAFE_VALUE_SENTINEL).map((d) => `${d.name}: ${d.value};`);
      })
      .join(' ');
    if (declarations) rules.push(`__SELECTOR__${cssPseudo} { ${declarations} }`);
  }
  return rules;
}

export function emitSelectorRules(
  roleName: string,
  selectors: VisualSelectorBlockNode[],
  diagnostics: DiagnosticCollector
): string[] {
  const rules: string[] = [];
  for (const block of selectors) {
    const combinatorFn = SELECTOR_CSS_COMBINATORS[block.combinator];
    if (!combinatorFn) {
      diagnostics.error(
        'VX_VISUAL_INVALID_SELECTOR',
        `Unknown selector combinator '${block.combinator}' in role '@${roleName}'.`,
        block.span,
        `Supported combinators: ${Object.keys(SELECTOR_CSS_COMBINATORS).join(', ')}.`
      );
      continue;
    }
    if (!block.selector.trim()) {
      diagnostics.error(
        'VX_VISUAL_INVALID_SELECTOR',
        `Selector combinator '${block.combinator}' in role '@${roleName}' requires a non-empty CSS selector argument.`,
        block.span
      );
      continue;
    }
    const cssSelector = `__SELECTOR__${combinatorFn(block.selector)}`;
    const declarations = block.properties
      .flatMap((p) => {
        const css = visualPropertyToCss(p.name, p.expression.text);
        if (!css) return [];
        return css.filter((d) => d.value && d.value !== UNSAFE_VALUE_SENTINEL).map((d) => `${d.name}: ${d.value};`);
      })
      .join(' ');
    if (declarations) rules.push(`${cssSelector} { ${declarations} }`);
  }
  return rules;
}
