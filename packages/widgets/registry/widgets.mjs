/**
 * Canonical VX native widget registry.
 *
 * Widget public contracts are read from packages/widgets/src/primitives/*.vx.
 * This registry owns semantic metadata shared by the compiler, runtime, tooling,
 * editor extension, and generated documentation. Generated consumers must never
 * maintain independent widget-name or native-element maps.
 */

export function defineWidgetRegistry(definitions) {
  return Object.freeze(definitions);
}

export const widgets = defineWidgetRegistry({
  Accordion: widget('composite', 'details', ['container', 'interactive'], { callProperty: 'title' }),
  Audio: widget('media', 'audio', ['media', 'interactive']),
  Avatar: widget('display', 'span', ['text']),
  Badge: widget('display', 'span', ['text'], { callProperty: 'label' }),
  Breadcrumb: widget('navigation', 'nav', ['container']),
  Button: widget('control', 'button', ['control', 'interactive', 'text'], { callProperty: 'label', defaults: { type: 'button' } }),
  Canvas: widget('media', 'canvas', ['media']),
  Checkbox: widget('control', 'input', ['control', 'formControl', 'interactive'], { defaults: { type: 'checkbox' } }),
  DataTable: widget('data', 'table', ['container']),
  DatePicker: widget('control', 'input', ['control', 'formControl', 'interactive'], { callProperty: 'value', defaults: { type: 'date' } }),
  Divider: widget('layout', 'hr'),
  Drawer: widget('overlay', 'aside', ['container', 'interactive']),
  ErrorSummary: widget('feedback', 'div', ['container']),
  FieldError: widget('feedback', 'span', ['text']),
  FieldGroup: widget('form', 'fieldset', ['container']),
  FileUpload: widget('control', 'input', ['control', 'formControl', 'interactive'], { defaults: { type: 'file' } }),
  Form: widget('form', 'form', ['container']),
  FormError: widget('feedback', 'div', ['text']),
  IFrame: widget('media', 'iframe', ['media'], { defaults: { loading: 'lazy', referrerPolicy: 'strict-origin-when-cross-origin', sandbox: '' } }),
  Icon: widget('display', 'span', ['media']),
  Image: widget('media', 'img', ['media'], { defaults: { loading: 'lazy', decoding: 'async' } }),
  Input: widget('control', 'input', ['control', 'formControl', 'interactive'], { callProperty: 'value' }),
  Link: widget('navigation', 'a', ['text', 'interactive'], { callProperty: 'text' }),
  List: widget('data', 'ul', ['container'], { defaults: { role: 'list' } }),
  Modal: widget('overlay', 'dialog', ['container', 'interactive']),
  Popover: widget('overlay', 'div', ['container', 'interactive']),
  ProgressBar: widget('feedback', 'progress'),
  Radio: widget('control', 'input', ['control', 'formControl', 'interactive'], { defaults: { type: 'radio' } }),
  ScrollView: widget('layout', 'div', ['container']),
  Select: widget('control', 'select', ['control', 'formControl', 'interactive'], { callProperty: 'value' }),
  Skeleton: widget('feedback', 'div'),
  Slider: widget('control', 'input', ['control', 'formControl', 'interactive'], { defaults: { type: 'range' } }),
  Spinner: widget('feedback', 'span'),
  Switch: widget('control', 'input', ['control', 'formControl', 'interactive'], { defaults: { type: 'checkbox', role: 'switch' } }),
  Tabs: widget('navigation', 'div', ['container', 'interactive']),
  Text: widget('text', 'span', ['text'], { callProperty: 'text' }),
  TextArea: widget('control', 'textarea', ['control', 'formControl', 'interactive'], { callProperty: 'value' }),
  Title: widget('text', 'h1', ['text'], { callProperty: 'text' }),
  Toast: widget('feedback', 'div', ['container']),
  Tooltip: widget('feedback', 'span', ['container']),
  Video: widget('media', 'video', ['media', 'interactive']),
  View: widget('layout', 'div', ['container']),
  VirtualList: widget('data', 'div', ['container'])
});

function widget(category, nativeElement, groups = [], options = {}) {
  return Object.freeze({
    category,
    nativeElement,
    groups: Object.freeze([...groups]),
    callProperty: options.callProperty ?? null,
    defaults: Object.freeze({ ...(options.defaults ?? {}) })
  });
}
