import type { VisualRoleCategory } from '@vx-foundation/types';

export interface BuiltinRoleDefinition {
  category: VisualRoleCategory;
  properties: Readonly<Record<string, string>>;
  states?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  arguments?: Readonly<Record<string, string>>;
  extraCss?: string;
}

export const STRUCTURAL_ROLE_NAMES = new Set([
  'grid', 'row', 'column', 'stack', 'scroll', 'overlay', 'center', 'flow',
  'cluster', 'wrap', 'sidebar', 'split', 'masonry', 'container', 'layer', 'region'
]);

const structural = (
  properties: Record<string, string>,
  arguments_: Record<string, string> = {},
  extraCss?: string
): BuiltinRoleDefinition => ({ category: 'structural', properties, arguments: arguments_, ...(extraCss ? { extraCss } : {}) });

const semantic = (
  properties: Record<string, string>,
  states: Record<string, Record<string, string>> = {},
  arguments_: Record<string, string> = {}
): BuiltinRoleDefinition => ({ category: 'semantic', properties, states, arguments: arguments_ });

/**
 * Compiler-owned roles. They express intent and are lowered away; none of them
 * creates a runtime widget or owns lifecycle.
 */
export const BUILTIN_ROLES: Readonly<Record<string, BuiltinRoleDefinition>> = {
  grid: structural(
    { display: 'grid', gap: 'md', columns: 'auto', minColumn: '240' },
    { min: 'minColumn', columns: 'columns', gap: 'gap', align: 'items', justify: 'content', dense: 'dense' }
  ),
  row: structural(
    { display: 'flex', flow: 'horizontal', gap: 'md' },
    { gap: 'gap', align: 'items', justify: 'content', wrap: 'wrap', reverse: 'reverse' }
  ),
  column: structural(
    { display: 'flex', flow: 'vertical', gap: 'md' },
    { gap: 'gap', align: 'items', justify: 'content', reverse: 'reverse' }
  ),
  stack: structural(
    { display: 'grid', stack: 'true' },
    { align: 'items', justify: 'content' },
    '> * { grid-area: 1 / 1; }'
  ),
  scroll: structural(
    { overflow: 'auto', overscroll: 'contain' },
    { axis: 'scrollAxis', max: 'maxHeight', snap: 'snap' }
  ),
  overlay: structural(
    { position: 'absolute', inset: '0', z: 'overlay' },
    { inset: 'inset', z: 'z' }
  ),
  center: structural(
    { display: 'grid', place: 'center' },
    { inset: 'inset', minHeight: 'minHeight' }
  ),
  flow: structural(
    { display: 'flex', flow: 'vertical', gap: 'md' },
    { direction: 'flow', gap: 'gap', align: 'items', justify: 'content', wrap: 'wrap' }
  ),
  cluster: structural(
    { display: 'flex', flow: 'horizontal', wrap: 'true', gap: 'sm', items: 'center' },
    { gap: 'gap', align: 'items', justify: 'content' }
  ),
  wrap: structural(
    { display: 'flex', flow: 'horizontal', wrap: 'true', gap: 'md' },
    { gap: 'gap', align: 'items', justify: 'content' }
  ),
  sidebar: structural(
    { display: 'grid', sidebar: '18rem', gap: 'lg' },
    { width: 'sidebar', gap: 'gap', side: 'side' }
  ),
  split: structural(
    { display: 'grid', split: '1 1', gap: 'lg' },
    { ratio: 'split', gap: 'gap', collapse: 'collapse' }
  ),
  masonry: structural(
    { columns: '3', gap: 'md' },
    { columns: 'columns', min: 'minColumn', gap: 'gap' }
  ),

  container: structural({ containerType: 'inline-size', width: 'fill' }, { name: 'containerName', type: 'containerType' }),
  layer: structural({ position: 'relative', isolation: 'isolate', z: 'base' }, { level: 'layer' }),
  region: structural({ display: 'block', contain: 'layout style' }, { direction: 'direction', writing: 'writingMode' }),


  page: semantic({ width: 'fill', minHeight: 'viewport', surface: 'base', tone: 'body' }),
  brand: semantic({ typography: 'heading.lg', tone: 'strong' }),
  section: semantic({ flow: 'vertical', gap: 'lg' }),
  title: semantic({ typography: 'heading.xl', tone: 'strong' }),
  subtitle: semantic({ typography: 'body.lg', tone: 'muted' }),
  body: semantic({ typography: 'body.md', tone: 'body' }),
  muted: semantic({ tone: 'muted' }),
  metadata: semantic({ typography: 'body.sm', tone: 'muted' }),
  price: semantic({ typography: 'heading.md', tone: 'strong' }),
  card: semantic(
    { surface: 'raised', corner: 'lg', inset: 'lg', border: 'subtle' },
    { hover: { surface: 'highlighted', elevation: 'sm' }, focusVisible: { outline: 'focus' } },
    { density: 'density', elevation: 'elevation' }
  ),
  panel: semantic({ surface: 'raised', corner: 'lg', inset: 'lg', border: 'subtle' }),
  primary: semantic(
    { control: 'primary', tone: 'onPrimary', surface: 'primary', corner: 'md', inset: 'control.md', cursor: 'pointer' },
    { hover: { surface: 'primaryHover' }, pressed: { transform: 'press' }, disabled: { opacity: 'disabled', cursor: 'blocked' } },
    { size: 'controlSize', width: 'width', tone: 'control' }
  ),
  secondary: semantic(
    { control: 'secondary', tone: 'body', surface: 'secondary', corner: 'md', inset: 'control.md', cursor: 'pointer' },
    { hover: { surface: 'secondaryHover' }, pressed: { transform: 'press' }, disabled: { opacity: 'disabled', cursor: 'blocked' } },
    { size: 'controlSize', width: 'width' }
  ),
  danger: semantic(
    { control: 'danger', tone: 'onDanger', surface: 'danger', corner: 'md', inset: 'control.md', cursor: 'pointer' },
    { hover: { surface: 'dangerHover' }, pressed: { transform: 'press' }, disabled: { opacity: 'disabled', cursor: 'blocked' } },
    { size: 'controlSize', width: 'width' }
  ),
  success: semantic({ tone: 'success', surface: 'successSoft', corner: 'md' }),
  warning: semantic({ tone: 'warning', surface: 'warningSoft', corner: 'md' }),
  info: semantic({ tone: 'info', surface: 'infoSoft', corner: 'md' }),
  badge: semantic({ typography: 'body.xs', corner: 'pill', inset: 'badge', surface: 'neutralSoft', tone: 'body' }),
  chip: semantic({ typography: 'body.sm', corner: 'pill', inset: 'chip', surface: 'neutralSoft' }),
  link: semantic({ tone: 'link', cursor: 'pointer', decoration: 'underlineOnHover' }),
  field: semantic({ surface: 'input', tone: 'body', border: 'input', corner: 'md', inset: 'control.md' }, { focusVisible: { outline: 'focus' }, invalid: { border: 'danger' } }),
  toolbar: semantic({ display: 'flex', flow: 'horizontal', items: 'center', gap: 'sm', surface: 'raised', inset: 'sm' }),
  navigation: semantic({ display: 'flex', flow: 'horizontal', items: 'center', gap: 'md' }),
  hero: semantic({ flow: 'vertical', items: 'center', gap: 'lg', inset: 'hero', textAlign: 'center' }),
  dialog: semantic({ surface: 'overlay', corner: 'xl', inset: 'xl', elevation: 'lg', maxWidth: 'dialog' }),
  empty: semantic({ flow: 'vertical', items: 'center', gap: 'md', inset: 'xl', tone: 'muted' }),
  loading: semantic({ opacity: 'loading', cursor: 'progress' }),
  code: semantic({ typography: 'mono.md', surface: 'code', corner: 'md', inset: 'md' }),
  avatar: semantic({ corner: 'round', surface: 'neutralSoft', overflow: 'hidden' }),
  landmark: semantic({ display: 'block' }),
  menu: semantic({ display: 'flex', flow: 'vertical', gap: 'xs' }),
  tabs: semantic({ display: 'flex', flow: 'horizontal', gap: 'xs' }),
  tooltip: semantic({ surface: 'overlay', tone: 'body', corner: 'sm', inset: 'sm', z: 'overlay' }),
  popover: semantic({ surface: 'overlay', corner: 'lg', elevation: 'md', z: 'overlay' }),
  live: semantic({ visibility: 'visible' }),
  focusScope: semantic({ isolation: 'isolate' })
};

export function getBuiltinRole(name: string): BuiltinRoleDefinition | undefined {
  return BUILTIN_ROLES[name];
}
