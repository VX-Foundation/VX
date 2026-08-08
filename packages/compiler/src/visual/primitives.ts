/**
 * Native HTML primitives and generated VX widget contracts.
 *
 * The compiler remains runtime-decoupled from @vx-foundation/widgets. Its
 * generated contract copy is produced from the canonical repository registry.
 */
import { PRIMITIVE_NAMES } from './generated/registry.js';

export {
  PRIMITIVE_NAMES,
  PRIMITIVE_SOURCES,
  WIDGET_REGISTRY
} from './generated/registry.js';
export type { PrimitiveName } from './generated/registry.js';
export type { CompilerWidgetDefinition } from './generated/contracts.js';

export const NATIVE_PRIMITIVE_TAGS = new Set([
  ...PRIMITIVE_NAMES,
  'Heading',
  'div', 'span', 'button', 'input', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'footer', 'section', 'main', 'aside', 'nav', 'form', 'label', 'select',
  'option', 'textarea', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'details', 'summary', 'dialog', 'fieldset', 'legend', 'ul', 'ol', 'li', 'hr',
  'iframe', 'canvas', 'audio', 'video', 'progress'
]);
