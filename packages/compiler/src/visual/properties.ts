// ─── Spacing / sizing tokens ────────────────────────────────────────────────
const SPACING: Record<string, string> = {
  none: '0', xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', '2xl': '3rem', '3xl': '4rem',
  'control.sm': '0.5rem 0.75rem', 'control.md': '0.625rem 1rem', 'control.lg': '0.75rem 1.25rem',
  badge: '0.25rem 0.5rem', chip: '0.375rem 0.75rem', hero: '4rem 2rem'
};
const CORNERS: Record<string, string> = {
  none: '0', xs: '0.125rem', sm: '0.25rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', pill: '9999px', round: '50%'
};
const WIDTHS: Record<string, string> = {
  fill: '100%', fit: 'fit-content', content: 'max-content', auto: 'auto',
  viewport: '100dvh', dialog: '40rem', prose: '65ch', screen: '100dvw'
};
const OPACITY: Record<string, string> = { disabled: '0.5', loading: '0.65', muted: '0.72', hidden: '0', full: '1' };
const Z_INDEX: Record<string, string> = { base: '0', raised: '10', overlay: '1000', modal: '1100', toast: '1200' };
const CURSOR: Record<string, string> = { blocked: 'not-allowed', pointer: 'pointer', progress: 'progress', text: 'text', grab: 'grab', grabbing: 'grabbing', zoom: 'zoom-in', default: 'default' };
const SHADOWS: Record<string, string> = {
  none: 'none', xs: '0 1px 2px rgb(0 0 0 / 0.08)', sm: '0 4px 12px rgb(0 0 0 / 0.10)',
  md: '0 10px 28px rgb(0 0 0 / 0.14)', lg: '0 20px 50px rgb(0 0 0 / 0.18)',
  inner: 'inset 0 2px 4px rgb(0 0 0 / 0.06)'
};
const EASING: Record<string, string> = {
  linear: 'linear', ease: 'ease', easeIn: 'ease-in', easeOut: 'ease-out', easeInOut: 'ease-in-out',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', snappy: 'cubic-bezier(0.2, 0, 0, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
};
const BLEND: Record<string, string> = {
  normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay',
  darken: 'darken', lighten: 'lighten', dodge: 'color-dodge', burn: 'color-burn',
  hardLight: 'hard-light', softLight: 'soft-light', difference: 'difference',
  exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity'
};

const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'order', 'flexGrow', 'flexShrink', 'animationIterations']);

// ─── Supported visual properties ────────────────────────────────────────────
export const SUPPORTED_VISUAL_PROPERTIES = new Set([
  // Layout — flex
  'display','flow','reverse','wrap','gap','space','items','content','place',
  'flexGrow','flexShrink','order','basis',
  // Layout — grid
  'columns','minColumn','dense','autoColumns','autoRows','autoFlow',
  'gridRows','gridAreas','gridColumn','gridRow','gridArea',
  // Sizing
  'width','height','minWidth','minHeight','maxWidth','maxHeight',
  'inset','insetX','insetY','margin','marginX','marginY',
  // Position
  'position','top','right','bottom','left','stack',
  // Typography
  'typography','size','weight','lineHeight','textAlign','decoration',
  'letterSpacing','wordSpacing','textTransform','textOverflow','whiteSpace',
  'fontFamily','fontStyle','fontVariant','hyphens',
  // Color / surface
  'surface','tone','accentColor','colorScheme','caretColor',
  // Border / outline
  'corner','border','borderTop','borderRight','borderBottom','borderLeft',
  'borderColor','borderStyle','borderWidth','outline','outlineOffset','ring',
  // Effects
  'elevation','opacity','z','shadow','blur','brightness','contrast',
  'saturate','grayscale','sepia','invert','hueRotate',
  'backdropBlur','backdropBrightness','backdropContrast','backdropSaturate',
  'filter','backdropFilter',
  // Background / gradient
  'background','backgroundImage','backgroundSize','backgroundPosition',
  'backgroundRepeat','backgroundAttachment','backgroundClip','backgroundOrigin',
  'backgroundBlend','gradient',
  // Mask / clip
  'mask','maskSize','maskPosition','maskRepeat','clip','clipPath',
  // Transform
  'transform','transformOrigin','perspective','perspectiveOrigin','backfaceVisibility',
  'rotate','scale','translate','skew',
  // Animation / transition
  'transition','motion','animation','animationName','animationDuration',
  'animationEasing','animationDelay','animationFill','animationIterations',
  'animationDirection','animationPlay',
  // Scroll
  'scrollAxis','snap','snapAlign','snapStop','overscroll','scrollBehavior','scrollPadding',
  'scrollMargin',
  // Container / layout context
  'overflow','overflowX','overflowY','containerType','containerName','contain','isolation',
  'sidebar','side','split','collapse','control','controlSize','density','aspect',
  // Object
  'objectFit','objectPosition',
  // Pointer / interaction
  'cursor','pointerEvents','touchAction','userSelect','resize',
  // Visibility
  'visibility',
  // Writing modes
  'direction','writingMode','textOrientation',
  // Misc
  'layer','overlayBehavior','scrollbar',
  // Special layout helpers
  'center','cluster',
]);

export function isSupportedVisualProperty(name: string): boolean {
  return SUPPORTED_VISUAL_PROPERTIES.has(name);
}

export interface CssDeclaration {
  name: string;
  value: string;
}

/**
 * Unsafe value sentinel — returned when a raw value cannot be safely emitted.
 * The caller (resolver) is responsible for emitting a VX_VISUAL_UNSAFE_VALUE diagnostic.
 */
export const UNSAFE_VALUE_SENTINEL = '__vx_unsafe__';

/** Returns true when the value is a known-safe raw CSS value. */
function isSafeRaw(value: string): boolean {
  // Allow: alphanumeric, spaces, common CSS chars, CSS functions, quotes, parens, commas, slashes
  // Disallow: semicolons (injection vector), unbalanced braces
  return /^[^;{}]+$/.test(value) && value.trim().length > 0;
}

function safe(value: string): string {
  if (isSafeRaw(value)) return value;
  return UNSAFE_VALUE_SENTINEL;
}

// ─── Main mapping function ───────────────────────────────────────────────────
export function visualPropertyToCss(property: string, rawExpression: string): CssDeclaration[] | null {
  if (!isSupportedVisualProperty(property)) return null;
  const raw = rawExpression.trim();
  const value = stripQuotes(raw);

  switch (property) {
    // ── Display / flow ────────────────────────────────────────────────────────
    case 'display': return one('display', value);
    case 'flow': {
      const dir = value === 'horizontal' || value === 'row' ? 'row'
        : value === 'horizontalReverse' ? 'row-reverse'
        : value === 'verticalReverse' ? 'column-reverse' : 'column';
      return [oneV('display', 'flex'), oneV('flex-direction', dir)];
    }
    case 'reverse': return value === 'true' ? one('flex-direction', 'row-reverse') : [];
    case 'wrap': return one('flex-wrap', value === 'true' ? 'wrap' : value === 'false' ? 'nowrap' : value);
    case 'gap': case 'space': return one('gap', token(value, SPACING));
    case 'items': return one('align-items', align(value));
    case 'content': return one('justify-content', align(value));
    case 'place': return one('place-items', align(value));
    case 'flexGrow': return one('flex-grow', safe(value));
    case 'flexShrink': return one('flex-shrink', safe(value));
    case 'order': return one('order', safe(value));
    case 'basis': return one('flex-basis', resolveLength(value));

    // ── Grid ─────────────────────────────────────────────────────────────────
    case 'columns': return one('grid-template-columns', columnsValue(value));
    case 'minColumn': return one('--vx-grid-min', resolveLength(value));
    case 'dense': return value === 'true' ? one('grid-auto-flow', 'dense') : [];
    case 'autoColumns': return one('grid-auto-columns', resolveLength(value));
    case 'autoRows': return one('grid-auto-rows', resolveLength(value));
    case 'autoFlow': return one('grid-auto-flow', value);
    case 'gridRows': return one('grid-template-rows', gridRowsValue(value));
    case 'gridAreas': return one('grid-template-areas', gridAreasValue(value));
    case 'gridColumn': return one('grid-column', gridSpanValue(value));
    case 'gridRow': return one('grid-row', gridSpanValue(value));
    case 'gridArea': return one('grid-area', safe(value));

    // ── Sizing ────────────────────────────────────────────────────────────────
    case 'width': return one('width', token(value, WIDTHS));
    case 'height': return one('height', token(value, WIDTHS));
    case 'minWidth': return one('min-width', resolveLength(value));
    case 'minHeight': return one('min-height', token(value, WIDTHS));
    case 'maxWidth': return one('max-width', token(value, WIDTHS));
    case 'maxHeight': return one('max-height', resolveLength(value));
    case 'inset': return one('padding', resolveInset(value));
    case 'insetX': return [oneV('padding-left', resolveLength(value)), oneV('padding-right', resolveLength(value))];
    case 'insetY': return [oneV('padding-top', resolveLength(value)), oneV('padding-bottom', resolveLength(value))];
    case 'margin': return one('margin', resolveInset(value));
    case 'marginX': return [oneV('margin-left', resolveLength(value)), oneV('margin-right', resolveLength(value))];
    case 'marginY': return [oneV('margin-top', resolveLength(value)), oneV('margin-bottom', resolveLength(value))];
    case 'aspect': return one('aspect-ratio', value.includes('/') ? safe(value) : `${value} / 1`);

    // ── Position ─────────────────────────────────────────────────────────────
    case 'position': return one('position', value);
    case 'top': return one('top', resolveLength(value));
    case 'right': return one('right', resolveLength(value));
    case 'bottom': return one('bottom', resolveLength(value));
    case 'left': return one('left', resolveLength(value));
    case 'stack': return [];

    // ── Color / surface ───────────────────────────────────────────────────────
    case 'surface': return one('background-color', colorToken('surface', value));
    case 'tone': return one('color', colorToken('tone', value));
    case 'accentColor': return one('accent-color', colorToken('accent', value));
    case 'colorScheme': return one('color-scheme', value);
    case 'caretColor': return one('caret-color', colorToken('tone', value));

    // ── Border / outline ─────────────────────────────────────────────────────
    case 'corner': return one('border-radius', token(value, CORNERS));
    case 'border': return one('border', borderToken(value));
    case 'borderTop': return one('border-top', borderToken(value));
    case 'borderRight': return one('border-right', borderToken(value));
    case 'borderBottom': return one('border-bottom', borderToken(value));
    case 'borderLeft': return one('border-left', borderToken(value));
    case 'borderColor': return one('border-color', colorToken('border', value));
    case 'borderStyle': return one('border-style', value);
    case 'borderWidth': return one('border-width', resolveLength(value));
    case 'outline': return one('outline', value === 'focus' ? '2px solid var(--vx-focus, #2563eb)' : safe(value));
    case 'outlineOffset': return one('outline-offset', resolveLength(value));
    case 'ring': return one('box-shadow', ringToken(value));

    // ── Elevation / shadow / effects ─────────────────────────────────────────
    case 'elevation': return one('box-shadow', token(value, SHADOWS));
    case 'shadow': return one('box-shadow', token(value, SHADOWS));
    case 'opacity': return one('opacity', token(value, OPACITY));
    case 'z': return one('z-index', token(value, Z_INDEX));
    case 'blur': return one('filter', `blur(${resolveLength(value)})`);
    case 'brightness': return one('filter', `brightness(${safe(value)})`);
    case 'contrast': return one('filter', `contrast(${safe(value)})`);
    case 'saturate': return one('filter', `saturate(${safe(value)})`);
    case 'grayscale': return value === 'true' ? one('filter', 'grayscale(1)') : one('filter', `grayscale(${safe(value)})`);
    case 'sepia': return value === 'true' ? one('filter', 'sepia(1)') : one('filter', `sepia(${safe(value)})`);
    case 'invert': return value === 'true' ? one('filter', 'invert(1)') : one('filter', `invert(${safe(value)})`);
    case 'hueRotate': return one('filter', `hue-rotate(${resolveLength(value)})`);
    case 'filter': return one('filter', safe(value));
    case 'backdropBlur': return one('backdrop-filter', `blur(${resolveLength(value)})`);
    case 'backdropBrightness': return one('backdrop-filter', `brightness(${safe(value)})`);
    case 'backdropContrast': return one('backdrop-filter', `contrast(${safe(value)})`);
    case 'backdropSaturate': return one('backdrop-filter', `saturate(${safe(value)})`);
    case 'backdropFilter': return one('backdrop-filter', safe(value));

    // ── Background / gradient ─────────────────────────────────────────────────
    case 'background': return one('background', backgroundValue(value));
    case 'backgroundImage': return one('background-image', gradientOrUrl(value));
    case 'backgroundSize': return one('background-size', value === 'cover' || value === 'contain' ? value : resolveLength(value));
    case 'backgroundPosition': return one('background-position', safe(value));
    case 'backgroundRepeat': return one('background-repeat', value);
    case 'backgroundAttachment': return one('background-attachment', value);
    case 'backgroundClip': return [oneV('background-clip', value), oneV('-webkit-background-clip', value)];
    case 'backgroundOrigin': return one('background-origin', value);
    case 'backgroundBlend': return one('background-blend-mode', token(value, BLEND));
    case 'gradient': return one('background-image', gradientShorthand(value));

    // ── Mask / clip ───────────────────────────────────────────────────────────
    case 'mask': return one('mask-image', gradientOrUrl(value));
    case 'maskSize': return one('mask-size', safe(value));
    case 'maskPosition': return one('mask-position', safe(value));
    case 'maskRepeat': return one('mask-repeat', value);
    case 'clip': return one('clip-path', safe(value));
    case 'clipPath': return one('clip-path', safe(value));

    // ── Transform ─────────────────────────────────────────────────────────────
    case 'transform': return one('transform', transformToken(value));
    case 'transformOrigin': return one('transform-origin', safe(value));
    case 'perspective': return one('perspective', resolveLength(value));
    case 'perspectiveOrigin': return one('perspective-origin', safe(value));
    case 'backfaceVisibility': return one('backface-visibility', value);
    case 'rotate': return one('rotate', value.endsWith('deg') || value.endsWith('turn') ? safe(value) : `${safe(value)}deg`);
    case 'scale': return one('scale', safe(value));
    case 'translate': return one('translate', resolveInset(value));
    case 'skew': return one('transform', `skew(${safe(value)})`);

    // ── Animation / transition ────────────────────────────────────────────────
    case 'transition': case 'motion': return one('transition', transitionToken(value));
    case 'animation': return one('animation', safe(value));
    case 'animationName': return one('animation-name', safe(value));
    case 'animationDuration': return one('animation-duration', value.endsWith('ms') || value.endsWith('s') ? safe(value) : `${value}ms`);
    case 'animationEasing': return one('animation-timing-function', token(value, EASING));
    case 'animationDelay': return one('animation-delay', value.endsWith('ms') || value.endsWith('s') ? safe(value) : `${value}ms`);
    case 'animationFill': return one('animation-fill-mode', value);
    case 'animationIterations': return one('animation-iteration-count', value === 'infinite' ? 'infinite' : safe(value));
    case 'animationDirection': return one('animation-direction', value);
    case 'animationPlay': return one('animation-play-state', value === 'paused' ? 'paused' : 'running');

    // ── Scroll ────────────────────────────────────────────────────────────────
    case 'scrollAxis': return value === 'horizontal' ? one('overflow-x', 'auto') : value === 'both' ? one('overflow', 'auto') : one('overflow-y', 'auto');
    case 'snap': return value === 'none' ? [] : one('scroll-snap-type', `${value} mandatory`);
    case 'snapAlign': return one('scroll-snap-align', value);
    case 'snapStop': return one('scroll-snap-stop', value === 'always' ? 'always' : 'normal');
    case 'overscroll': return one('overscroll-behavior', value);
    case 'scrollBehavior': return one('scroll-behavior', value);
    case 'scrollPadding': return one('scroll-padding', resolveInset(value));
    case 'scrollMargin': return one('scroll-margin', resolveInset(value));

    // ── Overflow / containment ────────────────────────────────────────────────
    case 'overflow': return one('overflow', value);
    case 'overflowX': return one('overflow-x', value);
    case 'overflowY': return one('overflow-y', value);
    case 'containerType': return one('container-type', value);
    case 'containerName': return one('container-name', safe(value));
    case 'contain': return one('contain', value);
    case 'isolation': return one('isolation', value);

    // ── Typography ────────────────────────────────────────────────────────────
    case 'typography': return typography(value);
    case 'size': return one('font-size', typographySize(value));
    case 'weight': return one('font-weight', value);
    case 'lineHeight': return one('line-height', resolveUnitlessOrLength(value));
    case 'textAlign': return one('text-align', value);
    case 'decoration': return value === 'underlineOnHover' ? [] : one('text-decoration', value);
    case 'letterSpacing': return one('letter-spacing', resolveLength(value));
    case 'wordSpacing': return one('word-spacing', resolveLength(value));
    case 'textTransform': return one('text-transform', value);
    case 'textOverflow': return one('text-overflow', value);
    case 'whiteSpace': return one('white-space', value);
    case 'fontFamily': return one('font-family', safe(value));
    case 'fontStyle': return one('font-style', value);
    case 'fontVariant': return one('font-variant', safe(value));
    case 'hyphens': return one('hyphens', value);

    // ── Pointer / interaction ─────────────────────────────────────────────────
    case 'cursor': return one('cursor', token(value, CURSOR));
    case 'pointerEvents': return one('pointer-events', value);
    case 'touchAction': return one('touch-action', value);
    case 'userSelect': return one('user-select', value);
    case 'resize': return one('resize', value);

    // ── Visibility ────────────────────────────────────────────────────────────
    case 'visibility': return one('visibility', value);

    // ── Writing modes ─────────────────────────────────────────────────────────
    case 'direction': return one('direction', value);
    case 'writingMode': return one('writing-mode', value);
    case 'textOrientation': return one('text-orientation', value);

    // ── Misc ─────────────────────────────────────────────────────────────────
    case 'objectFit': return one('object-fit', value);
    case 'objectPosition': return one('object-position', safe(value));
    case 'layer': return one('z-index', token(value, Z_INDEX));
    case 'overlayBehavior': return one('overscroll-behavior', value === 'contain' ? 'contain' : value);
    case 'scrollbar': return value === 'none'
      ? [oneV('scrollbar-width', 'none'), oneV('overflow', '-moz-scrollbars-none')]
      : value === 'thin' ? [oneV('scrollbar-width', 'thin')] : [];

    // ── Layout shorthands (structural roles handle these via args) ────────────
    case 'sidebar': return one('grid-template-columns', `${resolveLength(value)} minmax(0, 1fr)`);
    case 'side': return [];
    case 'split': return one('grid-template-columns', splitValue(value));
    case 'collapse': return [];
    case 'control': return [];
    case 'controlSize': return controlSize(value);
    case 'density': return density(value);
    case 'center': return [oneV('display', 'grid'), oneV('place-items', 'center')];
    case 'cluster': return [oneV('display', 'flex'), oneV('flex-wrap', 'wrap'), oneV('gap', SPACING['sm'] ?? '0.5rem'), oneV('align-items', 'center')];

    default: {
      const cssName = property.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function one(name: string, value: string): CssDeclaration[] { return [oneV(name, value)]; }
function oneV(name: string, value: string): CssDeclaration { return { name, value }; }

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    return value.slice(1, -1);
  return value;
}

function token(value: string, values: Record<string, string>): string {
  return values[value] ?? resolveLengthOrSafe(value);
}

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

function resolveUnitlessOrLength(value: string): string {
  return /^\d+(\.\d+)?$/.test(value) ? value : resolveLength(value);
}

function resolveInset(value: string): string {
  return value.split(/\s+/).map(resolveLength).join(' ');
}

function align(value: string): string {
  const map: Record<string, string> = {
    start: 'flex-start', end: 'flex-end', center: 'center',
    between: 'space-between', around: 'space-around', evenly: 'space-evenly', stretch: 'stretch'
  };
  return map[value] ?? safe(value);
}

function colorToken(kind: string, value: string): string {
  if (value.startsWith('theme.')) return `var(--vx-${value.replace(/\./g, '-')})`;
  if (/^(#|rgb|hsl|oklch|lch|lab|color\(|hwb\()/.test(value)) return safe(value);
  if (value === 'transparent') return 'transparent';
  if (value === 'currentColor') return 'currentColor';
  const fallback: Record<string, string> = {
    base: '#ffffff', raised: '#ffffff', overlay: '#ffffff', highlighted: '#f8fafc',
    input: '#ffffff', code: '#0f172a',
    primary: '#2563eb', primaryHover: '#1d4ed8', secondary: '#e2e8f0',
    secondaryHover: '#cbd5e1', danger: '#dc2626', dangerHover: '#b91c1c',
    successSoft: '#ecfdf5', warningSoft: '#fffbeb', infoSoft: '#eff6ff', neutralSoft: '#f1f5f9',
    body: '#334155', strong: '#0f172a', muted: '#64748b', onPrimary: '#ffffff',
    onDanger: '#ffffff', success: '#047857', warning: '#b45309', info: '#1d4ed8', link: '#2563eb',
    subtle: '#e2e8f0', accent: '#7c3aed'
  };
  return `var(--vx-${kind}-${value}, ${fallback[value] ?? 'currentColor'})`;
}

function borderToken(value: string): string {
  const map: Record<string, string> = {
    subtle: '1px solid var(--vx-border-subtle, #e2e8f0)',
    input: '1px solid var(--vx-border-input, #cbd5e1)',
    danger: '1px solid var(--vx-tone-danger, #dc2626)',
    strong: '1px solid var(--vx-border-strong, #94a3b8)',
    none: 'none'
  };
  return map[value] ?? safe(value);
}

function ringToken(value: string): string {
  if (value === 'focus') return '0 0 0 3px var(--vx-focus, #3b82f6)';
  if (value === 'danger') return '0 0 0 3px var(--vx-tone-danger, #dc2626)';
  return `0 0 0 ${resolveLength(value)} currentColor`;
}

function backgroundValue(value: string): string {
  if (/^(linear|radial|conic)-gradient\(/.test(value)) return safe(value);
  if (/^(#|rgb|hsl|oklch|color\()/.test(value)) return safe(value);
  return colorToken('surface', value);
}

function gradientOrUrl(value: string): string {
  if (/^(linear|radial|conic)-gradient\(/.test(value)) return safe(value);
  if (/^url\(/.test(value)) return safe(value);
  if (/^(#|rgb|hsl|oklch)/.test(value)) return safe(value);
  return safe(value);
}

function gradientShorthand(value: string): string {
  // Accepts shorthand like "top #2563eb #0f172a" or full gradient syntax
  if (/^(linear|radial|conic)-gradient\(/.test(value)) return safe(value);
  const parts = value.split(/\s+/);
  if (parts.length >= 2) {
    const dirMap: Record<string, string> = {
      top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right',
      topRight: 'to top right', topLeft: 'to top left',
      bottomRight: 'to bottom right', bottomLeft: 'to bottom left'
    };
    const dir = dirMap[parts[0] ?? ''];
    if (dir) {
      const stops = parts.slice(1).map((p) => colorToken('surface', p)).join(', ');
      return `linear-gradient(${dir}, ${stops})`;
    }
  }
  return safe(value);
}

function typography(value: string): CssDeclaration[] {
  const map: Record<string, [string, string, string]> = {
    'display.2xl': ['4.5rem', '800', '1.1'], 'display.xl': ['3.75rem', '800', '1.1'],
    'display.lg': ['3rem', '700', '1.15'], 'display.md': ['2.25rem', '700', '1.15'],
    'heading.xl': ['2rem', '700', '1.15'], 'heading.lg': ['1.5rem', '700', '1.2'],
    'heading.md': ['1.25rem', '650', '1.25'], 'heading.sm': ['1.125rem', '600', '1.3'],
    'heading.xs': ['1rem', '600', '1.35'],
    'body.xl': ['1.25rem', '400', '1.7'], 'body.lg': ['1.125rem', '400', '1.6'],
    'body.md': ['1rem', '400', '1.5'], 'body.sm': ['0.875rem', '400', '1.45'],
    'body.xs': ['0.75rem', '500', '1.35'],
    'label.lg': ['1rem', '500', '1.4'], 'label.md': ['0.875rem', '500', '1.4'],
    'label.sm': ['0.75rem', '500', '1.4'],
    'mono.lg': ['1rem', '400', '1.6'], 'mono.md': ['0.875rem', '400', '1.55'],
    'mono.sm': ['0.75rem', '400', '1.5']
  };
  const [sz, wt, lh] = map[value] ?? ['1rem', '400', '1.5'];
  const result = [oneV('font-size', sz), oneV('font-weight', wt), oneV('line-height', lh)];
  if (value.startsWith('mono.')) result.push(oneV('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace'));
  return result;
}

function typographySize(value: string): string {
  const map: Record<string, string> = {
    '2xs': '0.625rem', xs: '0.75rem', sm: '0.875rem', md: '1rem',
    lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem'
  };
  return map[value] ?? resolveLength(value);
}

function transitionToken(value: string): string {
  const map: Record<string, string> = {
    fast: '120ms ease', normal: '180ms ease', slow: '280ms ease', none: 'none',
    all: 'all 180ms ease', colors: 'color 180ms ease, background-color 180ms ease, border-color 180ms ease',
    transform: 'transform 180ms ease', opacity: 'opacity 180ms ease'
  };
  return map[value] ?? safe(value);
}

function transformToken(value: string): string {
  if (value === 'press') return 'scale(0.98)';
  if (value === 'lift') return 'translateY(-2px)';
  if (value === 'none') return 'none';
  return safe(value);
}

function columnsValue(value: string): string {
  if (value === 'auto') return 'repeat(auto-fit, minmax(var(--vx-grid-min, 15rem), 1fr))';
  if (value === 'autoFill') return 'repeat(auto-fill, minmax(var(--vx-grid-min, 15rem), 1fr))';
  if (/^\d+$/.test(value)) return `repeat(${value}, minmax(0, 1fr))`;
  // Subgrid support
  if (value === 'subgrid') return 'subgrid';
  return safe(value);
}

function gridRowsValue(value: string): string {
  if (/^\d+$/.test(value)) return `repeat(${value}, minmax(0, 1fr))`;
  if (value === 'subgrid') return 'subgrid';
  // Accept named rows like "auto 1fr auto"
  return safe(value);
}

function gridAreasValue(value: string): string {
  // Accepts: '"header header" "sidebar main"' or array-style
  // Already quoted strings pass through; also accept dot-separated area names
  return safe(value);
}

function gridSpanValue(value: string): string {
  if (/^\d+$/.test(value)) return `span ${value}`;
  if (value === 'full') return '1 / -1';
  // Accept explicit like "1 / 3", "span 2", "auto"
  return safe(value);
}

function splitValue(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && parts.every((p) => /^\d+(\.\d+)?$/.test(p)))
    return `${parts[0]}fr ${parts[1]}fr`;
  return 'minmax(0, 1fr) minmax(0, 1fr)';
}

function controlSize(value: string): CssDeclaration[] {
  const map: Record<string, [string, string]> = {
    small: ['0.5rem 0.75rem', '0.875rem'],
    medium: ['0.625rem 1rem', '1rem'],
    large: ['0.75rem 1.25rem', '1.0625rem']
  };
  const [padding, fontSize] = map[value] ?? map['medium']!;
  return [oneV('padding', padding), oneV('font-size', fontSize)];
}

function density(value: string): CssDeclaration[] {
  const map: Record<string, string> = { compact: '0.75rem', comfortable: '1rem', spacious: '1.5rem' };
  return one('padding', map[value] ?? resolveLength(value));
}
