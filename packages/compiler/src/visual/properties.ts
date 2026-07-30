const SPACING: Record<string, string> = {
  none: '0', xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem',
  'control.sm': '0.5rem 0.75rem', 'control.md': '0.625rem 1rem', 'control.lg': '0.75rem 1.25rem',
  badge: '0.25rem 0.5rem', chip: '0.375rem 0.75rem', hero: '4rem 2rem'
};
const CORNERS: Record<string, string> = {
  none: '0', xs: '0.125rem', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', pill: '9999px', round: '50%'
};
const WIDTHS: Record<string, string> = {
  fill: '100%', fit: 'fit-content', content: 'max-content', auto: 'auto', viewport: '100dvh', dialog: '40rem'
};
const OPACITY: Record<string, string> = { disabled: '0.5', loading: '0.65', muted: '0.72', hidden: '0' };
const Z_INDEX: Record<string, string> = { base: '0', raised: '10', overlay: '1000', modal: '1100', toast: '1200' };
const CURSOR: Record<string, string> = { blocked: 'not-allowed', pointer: 'pointer', progress: 'progress', text: 'text' };
const SHADOWS: Record<string, string> = {
  none: 'none', xs: '0 1px 2px rgb(0 0 0 / 0.08)', sm: '0 4px 12px rgb(0 0 0 / 0.10)',
  md: '0 10px 28px rgb(0 0 0 / 0.14)', lg: '0 20px 50px rgb(0 0 0 / 0.18)'
};

const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'order', 'flexGrow', 'flexShrink']);
const RAW_SAFE = /^[a-zA-Z0-9_./%+\-()\s,]+$/;

export const SUPPORTED_VISUAL_PROPERTIES = new Set([
  'display','flow','reverse','wrap','gap','space','inset','insetX','insetY','margin',
  'width','height','minWidth','minHeight','maxWidth','maxHeight','items','content','place','textAlign',
  'surface','tone','corner','border','outline','elevation','opacity','z','cursor','overflow','overscroll','position',
  'typography','size','weight','lineHeight','decoration','transition','transform','columns','minColumn','dense','stack',
  'scrollAxis','snap','sidebar','side','split','collapse','control','controlSize','density','aspect','objectFit','objectPosition',
  'visibility','pointerEvents','order','gridArea','top','right','bottom','left','flexGrow','flexShrink',
  'direction','writingMode','textOrientation','isolation','layer','overlayBehavior','touchAction','userSelect','accentColor','colorScheme','contain','containerType','containerName','motion','animation' 
]);

export function isSupportedVisualProperty(name: string): boolean {
  return SUPPORTED_VISUAL_PROPERTIES.has(name);
}

export interface CssDeclaration {
  name: string;
  value: string;
}

export function visualPropertyToCss(property: string, rawExpression: string): CssDeclaration[] | null {
  if (!isSupportedVisualProperty(property)) return null;
  const raw = rawExpression.trim();
  const value = stripQuotes(raw);

  switch (property) {
    case 'display': return one('display', value);
    case 'flow': {
      const direction = value === 'horizontal' || value === 'row' ? 'row' : value === 'horizontalReverse' ? 'row-reverse' : value === 'verticalReverse' ? 'column-reverse' : 'column';
      return [oneValue('display', 'flex'), oneValue('flex-direction', direction)];
    }
    case 'reverse': return value === 'true' ? one('flex-direction', 'row-reverse') : [];
    case 'wrap': return one('flex-wrap', value === 'true' ? 'wrap' : value === 'false' ? 'nowrap' : value);
    case 'gap':
    case 'space': return one('gap', token(value, SPACING));
    case 'inset': return one('padding', resolveInset(value));
    case 'insetX': return [oneValue('padding-left', resolveLength(value)), oneValue('padding-right', resolveLength(value))];
    case 'insetY': return [oneValue('padding-top', resolveLength(value)), oneValue('padding-bottom', resolveLength(value))];
    case 'margin': return one('margin', resolveInset(value));
    case 'width': return one('width', token(value, WIDTHS));
    case 'height': return one('height', token(value, WIDTHS));
    case 'minWidth': return one('min-width', resolveLength(value));
    case 'minHeight': return one('min-height', token(value, WIDTHS));
    case 'maxWidth': return one('max-width', token(value, WIDTHS));
    case 'maxHeight': return one('max-height', resolveLength(value));
    case 'items': return one('align-items', align(value));
    case 'content': return one('justify-content', align(value));
    case 'place': return one('place-items', align(value));
    case 'textAlign': return one('text-align', value);
    case 'surface': return one('background-color', colorToken('surface', value));
    case 'tone': return one('color', colorToken('tone', value));
    case 'corner': return one('border-radius', token(value, CORNERS));
    case 'border': return one('border', borderToken(value));
    case 'outline': return one('outline', value === 'focus' ? '2px solid var(--vx-focus, #2563eb)' : safe(value));
    case 'elevation': return one('box-shadow', token(value, SHADOWS));
    case 'opacity': return one('opacity', token(value, OPACITY));
    case 'z': return one('z-index', token(value, Z_INDEX));
    case 'cursor': return one('cursor', token(value, CURSOR));
    case 'overflow': return one('overflow', value);
    case 'overscroll': return one('overscroll-behavior', value);
    case 'position': return one('position', value);
    case 'direction': return one('direction', value);
    case 'writingMode': return one('writing-mode', value);
    case 'textOrientation': return one('text-orientation', value);
    case 'isolation': return one('isolation', value);
    case 'layer': return one('z-index', token(value, Z_INDEX));
    case 'overlayBehavior': return one('overscroll-behavior', value === 'contain' ? 'contain' : value);
    case 'motion': return one('transition', transitionToken(value));
    case 'animation': return one('animation', safe(value));
    case 'typography': return typography(value);
    case 'size': return one('font-size', typographySize(value));
    case 'weight': return one('font-weight', value);
    case 'lineHeight': return one('line-height', resolveUnitlessOrLength(value));
    case 'decoration': return value === 'underlineOnHover' ? [] : one('text-decoration', value);
    case 'transition': return one('transition', transitionToken(value));
    case 'transform': return one('transform', transformToken(value));
    case 'columns': return one('grid-template-columns', columnsValue(value));
    case 'minColumn': return one('--vx-grid-min', resolveLength(value));
    case 'dense': return value === 'true' ? one('grid-auto-flow', 'dense') : [];
    case 'stack': return [];
    case 'scrollAxis': return value === 'horizontal' ? one('overflow-x', 'auto') : value === 'both' ? one('overflow', 'auto') : one('overflow-y', 'auto');
    case 'snap': return value === 'none' ? [] : one('scroll-snap-type', `${value} mandatory`);
    case 'sidebar': return one('grid-template-columns', `${resolveLength(value)} minmax(0, 1fr)`);
    case 'side': return [];
    case 'split': return one('grid-template-columns', splitValue(value));
    case 'collapse': return [];
    case 'control': return [];
    case 'controlSize': return controlSize(value);
    case 'density': return density(value);
    default: {
      const cssName = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      if (!/^[a-z-]+$/.test(cssName)) return null;
      return one(cssName, UNITLESS.has(property) ? safe(value) : resolveLengthOrSafe(value));
    }
  }
}

export function cssValueForRuntime(property: string, value: unknown): CssDeclaration[] {
  if (value == null || value === false) return visualPropertyToCss(property, '""') ?? [];
  const raw = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return visualPropertyToCss(property, raw) ?? [];
}

function one(name: string, value: string): CssDeclaration[] { return [oneValue(name, value)]; }
function oneValue(name: string, value: string): CssDeclaration { return { name, value }; }
function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
function token(value: string, values: Record<string, string>): string { return values[value] ?? resolveLengthOrSafe(value); }
function resolveLength(value: string): string {
  if (value in SPACING) return SPACING[value]!;
  if (value in WIDTHS) return WIDTHS[value]!;
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}px`;
  return safe(value);
}
function resolveLengthOrSafe(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}px`;
  return safe(value);
}
function resolveUnitlessOrLength(value: string): string { return /^\d+(\.\d+)?$/.test(value) ? value : resolveLength(value); }
function resolveInset(value: string): string { return value.split(/\s+/).map(resolveLength).join(' '); }
function safe(value: string): string { return RAW_SAFE.test(value) ? value : ''; }
function align(value: string): string {
  const values: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly', stretch: 'stretch' };
  return values[value] ?? safe(value);
}
function colorToken(kind: string, value: string): string {
  if (value.startsWith('theme.')) return `var(--vx-${value.replace(/\./g, '-')})`;
  if (/^(#|rgb|hsl|oklch|color\()/.test(value)) return safe(value);
  const fallback: Record<string, string> = {
    base: '#ffffff', raised: '#ffffff', overlay: '#ffffff', highlighted: '#f8fafc', input: '#ffffff', code: '#0f172a',
    primary: '#2563eb', primaryHover: '#1d4ed8', secondary: '#e2e8f0', secondaryHover: '#cbd5e1', danger: '#dc2626', dangerHover: '#b91c1c',
    successSoft: '#ecfdf5', warningSoft: '#fffbeb', infoSoft: '#eff6ff', neutralSoft: '#f1f5f9',
    body: '#334155', strong: '#0f172a', muted: '#64748b', onPrimary: '#ffffff', onDanger: '#ffffff', success: '#047857', warning: '#b45309', info: '#1d4ed8', link: '#2563eb'
  };
  return `var(--vx-${kind}-${value}, ${fallback[value] ?? 'currentColor'})`;
}
function borderToken(value: string): string {
  const values: Record<string, string> = { subtle: '1px solid var(--vx-border-subtle, #e2e8f0)', input: '1px solid var(--vx-border-input, #cbd5e1)', danger: '1px solid var(--vx-tone-danger, #dc2626)', none: 'none' };
  return values[value] ?? safe(value);
}
function typography(value: string): CssDeclaration[] {
  const map: Record<string, [string, string, string]> = {
    'heading.xl': ['2rem', '700', '1.15'], 'heading.lg': ['1.5rem', '700', '1.2'], 'heading.md': ['1.25rem', '650', '1.25'],
    'body.lg': ['1.125rem', '400', '1.6'], 'body.md': ['1rem', '400', '1.5'], 'body.sm': ['0.875rem', '400', '1.45'], 'body.xs': ['0.75rem', '500', '1.35'],
    'mono.md': ['0.875rem', '400', '1.55']
  };
  const [size, weight, line] = map[value] ?? ['1rem', '400', '1.5'];
  const result = [oneValue('font-size', size), oneValue('font-weight', weight), oneValue('line-height', line)];
  if (value.startsWith('mono.')) result.push(oneValue('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace'));
  return result;
}
function typographySize(value: string): string {
  const values: Record<string, string> = { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem' };
  return values[value] ?? resolveLength(value);
}
function transitionToken(value: string): string {
  const values: Record<string, string> = { fast: '120ms ease', normal: '180ms ease', slow: '280ms ease', none: 'none' };
  return values[value] ?? safe(value);
}
function transformToken(value: string): string { return value === 'press' ? 'scale(0.98)' : value === 'lift' ? 'translateY(-2px)' : safe(value); }
function columnsValue(value: string): string {
  if (value === 'auto') return 'repeat(auto-fit, minmax(var(--vx-grid-min, 15rem), 1fr))';
  if (/^\d+$/.test(value)) return `repeat(${value}, minmax(0, 1fr))`;
  return safe(value);
}
function splitValue(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts.every((part) => /^\d+(\.\d+)?$/.test(part))) return `${parts[0]}fr ${parts[1]}fr`;
  return 'minmax(0, 1fr) minmax(0, 1fr)';
}
function controlSize(value: string): CssDeclaration[] {
  const sizes: Record<string, [string, string]> = { small: ['0.5rem 0.75rem', '0.875rem'], medium: ['0.625rem 1rem', '1rem'], large: ['0.75rem 1.25rem', '1.0625rem'] };
  const [padding, fontSize] = sizes[value] ?? sizes['medium']!;
  return [oneValue('padding', padding), oneValue('font-size', fontSize)];
}
function density(value: string): CssDeclaration[] {
  const values: Record<string, string> = { compact: '0.75rem', comfortable: '1rem', spacious: '1.5rem' };
  return one('padding', values[value] ?? resolveLength(value));
}
