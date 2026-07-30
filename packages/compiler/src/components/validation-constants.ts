import type { ScriptStatement } from '@vx/types';

export const ALLOWED_PUBLIC_KINDS = new Set<ScriptStatement['kind']>([
  'ConstDeclaration',
  'DeriveDeclaration',
  'QueryDeclaration',
  'ActionDeclaration',
  'StoreDeclaration',
  'SchemaDeclaration',
  'FormDeclaration'
]);
export const RESERVED_IMPORT_NAMES = new Set([
  'emit', '$event', '$nativeEvent', '$action', '$effect', 'props', 'runtime', 'content', 'parts'
]);
export const UNSAFE_MEMBER_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
export const CONTAINER_WIDGETS = new Set(['View', 'List', 'Form', 'ScrollView']);
export const TEXT_WIDGETS = new Set(['Text', 'Title', 'Link']);
export const CONTROL_WIDGETS = new Set(['Button', 'Input', 'Checkbox', 'Radio', 'Select', 'TextArea', 'Slider', 'Switch']);
export const MEDIA_WIDGETS = new Set(['Image', 'IFrame', 'Canvas', 'Audio', 'Video', 'Icon']);
export const PRIMITIVE_WIDGETS = new Set([...CONTAINER_WIDGETS, ...TEXT_WIDGETS, ...CONTROL_WIDGETS, ...MEDIA_WIDGETS, 'Divider', 'ProgressBar']);
export const SPECIAL_COMPONENT_WIDGETS = new Set(['Content', 'Dynamic', 'Portal']);
