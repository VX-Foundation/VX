import type {
  SourceSpan,
  VisualConditionArgumentNode,
  VisualDesignSystem,
  VisualResolvedCondition
} from '@vx-foundation/types';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';

export const CONDITION_NAMES = new Set([
  'hover', 'pressed', 'focus', 'focusVisible', 'disabled', 'selected', 'checked',
  'expanded', 'invalid', 'loading', 'dark', 'light', 'motion', 'viewport',
  'container', 'orientation', 'contrast', 'pointer',
  // New non-dimensional media conditions
  'print', 'screen', 'hoverNone', 'coarsePointer', 'forced', 'hdr', 'reducedData'
]);

export function resolveCondition(
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
  if (name === 'print') return { name, arguments: args, media: 'print' };
  if (name === 'screen') return { name, arguments: args, media: 'screen' };
  if (name === 'hoverNone') return { name, arguments: args, media: '(hover: none)' };
  if (name === 'coarsePointer') return { name, arguments: args, media: '(pointer: coarse)' };
  if (name === 'forced') return { name, arguments: args, media: '(forced-colors: active)' };
  if (name === 'hdr') return { name, arguments: args, media: '(dynamic-range: high)' };
  if (name === 'reducedData') return { name, arguments: args, media: '(prefers-reduced-data: reduce)' };
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

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeCss(value: string): string {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
