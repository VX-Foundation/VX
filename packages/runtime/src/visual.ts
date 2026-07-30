const spacing: Record<string, string> = {
  none: '0', xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem',
  'control.sm': '0.5rem 0.75rem', 'control.md': '0.625rem 1rem', 'control.lg': '0.75rem 1.25rem',
  badge: '0.25rem 0.5rem', chip: '0.375rem 0.75rem', hero: '4rem 2rem'
};
const corners: Record<string, string> = {
  none: '0', xs: '0.125rem', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', pill: '9999px', round: '50%'
};
const widths: Record<string, string> = { fill: '100%', fit: 'fit-content', content: 'max-content', auto: 'auto', viewport: '100dvh', dialog: '40rem' };
const opacity: Record<string, string> = { disabled: '0.5', loading: '0.65', muted: '0.72', hidden: '0' };
const cursors: Record<string, string> = { blocked: 'not-allowed', pointer: 'pointer', progress: 'progress', text: 'text' };
const zIndexes: Record<string, string> = { base: '0', raised: '10', overlay: '1000', modal: '1100', toast: '1200' };

export function attachVisualIntent(
  node: HTMLElement,
  classNames: readonly string[],
  structuralRole: string | null,
  semanticRole: string | null
): void {
  if (node.classList && typeof node.classList.add === 'function') {
    node.classList.add(...classNames);
  } else {
    const current = node.getAttribute?.('class') ?? '';
    const merged = Array.from(new Set([...current.split(/\s+/).filter(Boolean), ...classNames])).join(' ');
    node.setAttribute('class', merged);
  }
  if (structuralRole) node.dataset['vxLayout'] = structuralRole;
  if (semanticRole) node.dataset['vxRole'] = semanticRole;
}

export function applyVisualSemantics(node: HTMLElement, widgetName: string, role: string): void {
  if (role === 'navigation' && node.tagName !== 'NAV') node.setAttribute('role', 'navigation');
  if (role === 'toolbar') node.setAttribute('role', 'toolbar');
  if (role === 'dialog') {
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
  }
  if (role === 'loading') node.setAttribute('aria-busy', 'true');
  if (role === 'link' && widgetName !== 'Link') node.setAttribute('role', 'link');
  if (role === 'title' && !/^H[1-6]$/.test(node.tagName)) {
    node.setAttribute('role', 'heading');
    node.setAttribute('aria-level', '1');
  }
}

export function setVisualProperty(node: HTMLElement, property: string, value: unknown): void {
  for (const declaration of runtimeDeclarations(property, value)) {
    node.style.setProperty(declaration.name, declaration.value);
  }
}

export function setVisualState(node: HTMLElement, state: string, active: boolean): void {
  const states = new Set((node.dataset['vxState'] ?? '').split(/\s+/).filter(Boolean));
  if (active) states.add(state);
  else states.delete(state);
  const value = [...states].join(' ');
  if (value) node.dataset['vxState'] = value;
  else delete node.dataset['vxState'];
}

function runtimeDeclarations(property: string, input: unknown): Array<{ name: string; value: string }> {
  const value = input == null ? '' : String(input);
  const one = (name: string, resolved = value) => [{ name, value: resolved }];

  switch (property) {
    case 'display': return one('display');
    case 'flow': return [{ name: 'display', value: 'flex' }, { name: 'flex-direction', value: value === 'horizontal' || value === 'row' ? 'row' : value === 'horizontalReverse' ? 'row-reverse' : value === 'verticalReverse' ? 'column-reverse' : 'column' }];
    case 'wrap': return one('flex-wrap', truthy(input) ? 'wrap' : 'nowrap');
    case 'gap':
    case 'space': return one('gap', token(value, spacing));
    case 'inset': return one('padding', inset(value));
    case 'insetX': return [{ name: 'padding-left', value: spacingLength(value) }, { name: 'padding-right', value: spacingLength(value) }];
    case 'insetY': return [{ name: 'padding-top', value: spacingLength(value) }, { name: 'padding-bottom', value: spacingLength(value) }];
    case 'margin': return one('margin', inset(value));
    case 'width': return one('width', token(value, widths));
    case 'height': return one('height', token(value, widths));
    case 'minWidth': return one('min-width', length(value));
    case 'minHeight': return one('min-height', token(value, widths));
    case 'maxWidth': return one('max-width', token(value, widths));
    case 'maxHeight': return one('max-height', length(value));
    case 'items': return one('align-items', alignment(value));
    case 'content': return one('justify-content', alignment(value));
    case 'place': return one('place-items', alignment(value));
    case 'textAlign': return one('text-align');
    case 'surface': return one('background-color', color('surface', value));
    case 'tone': return one('color', color('tone', value));
    case 'corner': return one('border-radius', token(value, corners));
    case 'opacity': return one('opacity', opacity[value] ?? value);
    case 'cursor': return one('cursor', token(value, cursors));
    case 'z': return one('z-index', zIndexes[value] ?? value);
    case 'overflow': return one('overflow');
    case 'position': return one('position');
    case 'direction': return one('direction');
    case 'writingMode': return one('writing-mode');
    case 'textOrientation': return one('text-orientation');
    case 'isolation': return one('isolation');
    case 'layer': return one('z-index', zIndexes[value] ?? value);
    case 'motion': return one('transition', value === 'reduced' ? 'none' : value);
    case 'containerType': return one('container-type');
    case 'containerName': return one('container-name');
    case 'size': return one('font-size', length(value));
    case 'weight': return one('font-weight');
    case 'lineHeight': return one('line-height');
    case 'columns': return one('grid-template-columns', /^\d+$/.test(value) ? `repeat(${value}, minmax(0, 1fr))` : 'repeat(auto-fit, minmax(var(--vx-grid-min, 15rem), 1fr))');
    case 'minColumn': return one('--vx-grid-min', length(value));
    case 'scrollAxis': return value === 'horizontal' ? one('overflow-x', 'auto') : value === 'both' ? one('overflow', 'auto') : one('overflow-y', 'auto');
    case 'controlSize': return controlSize(value);
    default: return one(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), numericLength(property, input));
  }
}

function controlSize(value: string): Array<{ name: string; value: string }> {
  const sizes: Record<string, [string, string]> = { small: ['0.5rem 0.75rem', '0.875rem'], medium: ['0.625rem 1rem', '1rem'], large: ['0.75rem 1.25rem', '1.0625rem'] };
  const [padding, fontSize] = sizes[value] ?? sizes['medium']!;
  return [{ name: 'padding', value: padding }, { name: 'font-size', value: fontSize }];
}
function truthy(value: unknown): boolean { return value !== false && value != null && value !== 'false'; }
function token(value: string, values: Record<string, string>): string { return values[value] ?? length(value); }
function length(value: string): string { return /^-?\d+(\.\d+)?$/.test(value) ? `${value}px` : value; }
function inset(value: string): string { return value.split(/\s+/).map(spacingLength).join(' '); }
function spacingLength(value: string): string { return token(value, spacing); }
function numericLength(property: string, value: unknown): string {
  if (typeof value !== 'number') return String(value ?? '');
  return ['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'order', 'flexGrow', 'flexShrink'].includes(property) ? String(value) : `${value}px`;
}
function alignment(value: string): string {
  const map: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', between: 'space-between', around: 'space-around', evenly: 'space-evenly', stretch: 'stretch' };
  return map[value] ?? value;
}
function color(kind: string, value: string): string {
  if (value.startsWith('theme.')) return `var(--vx-${value.replace(/\./g, '-')})`;
  return `var(--vx-${kind}-${value}, ${kind === 'tone' ? 'currentColor' : 'transparent'})`;
}
