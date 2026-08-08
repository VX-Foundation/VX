import type { ScriptStatement } from '@vx-foundation/types';

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
export {
  CONTAINER_WIDGETS,
  CONTROL_WIDGETS,
  FORM_CONTROL_WIDGETS,
  INTERACTIVE_WIDGETS,
  MEDIA_WIDGETS,
  PRIMITIVE_WIDGETS,
  TEXT_WIDGETS
} from './validation-constants.generated.js';
export const SPECIAL_COMPONENT_WIDGETS = new Set(['Content', 'Dynamic', 'Portal']);
