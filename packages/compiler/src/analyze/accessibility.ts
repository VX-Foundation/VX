import type { ExpressionNode, ViewBlockNode, ViewNode, WidgetNode, WidgetProperty } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';

const FORM_CONTROLS = new Set(['Input', 'TextArea', 'Select', 'Checkbox', 'Radio', 'Slider', 'Switch']);
const INTERACTIVE_WIDGETS = new Set(['Button', 'Link', ...FORM_CONTROLS]);
const LABEL_PROPERTIES = ['ariaLabel', 'ariaLabelledBy'] as const;

/**
 * Enforces accessibility invariants that can be proven from the VX source tree.
 * Runtime-only facts such as computed contrast remain browser-conformance work.
 */
export function validateAccessibility(view: ViewBlockNode, diagnostics: DiagnosticCollector): void {
  const staticIds = new Map<string, WidgetNode>();
  const references: Array<{ widget: WidgetNode; property: WidgetProperty; id: string }> = [];

  const walk = (node: ViewNode, interactiveAncestor?: WidgetNode): void => {
    if (node.kind === 'Widget') {
      const id = staticString(property(node, 'id')?.expression);
      if (id) {
        const previous = staticIds.get(id);
        if (previous) {
          diagnostics.error(
            'VX_A11Y_DUPLICATE_ID',
            `Static id '${id}' is used by more than one widget.`,
            property(node, 'id')!.span,
            'Use a unique id so labels and descriptions target exactly one element.',
            [`First declaration starts at ${previous.span.start.line}:${previous.span.start.column}.`]
          );
        } else {
          staticIds.set(id, node);
        }
      }

      validateWidget(node, diagnostics);

      for (const name of ['ariaLabelledBy', 'ariaDescribedBy', 'ariaControls']) {
        const binding = property(node, name);
        const target = staticString(binding?.expression);
        if (binding && target) references.push({ widget: node, property: binding, id: target });
      }

      const interactive = INTERACTIVE_WIDGETS.has(node.tagName) ? node : undefined;
      if (interactiveAncestor && interactive) {
        diagnostics.error(
          'VX_A11Y_NESTED_INTERACTIVE',
          `Interactive widget '${node.tagName}' cannot be nested inside '${interactiveAncestor.tagName}'.`,
          node.span,
          'Use adjacent controls or move the inner action outside the interactive ancestor.'
        );
      }

      const nextAncestor = interactive ?? interactiveAncestor;
      node.children.forEach((child) => walk(child, nextAncestor));
      node.contentRegions.forEach((region) => region.children.forEach((child) => walk(child, nextAncestor)));
      return;
    }
    if (node.kind === 'IfBlock') {
      node.branches.forEach((branch) => branch.children.forEach((child) => walk(child, interactiveAncestor)));
      return;
    }
    if (node.kind === 'WhenBlock') {
      node.branches.forEach((branch) => branch.children.forEach((child) => walk(child, interactiveAncestor)));
      node.fallback?.forEach((child) => walk(child, interactiveAncestor));
      return;
    }
    if (node.kind === 'KeyedCollection') {
      node.children.forEach((child) => walk(child, interactiveAncestor));
      node.fallbacks.forEach((fallback) => fallback.children.forEach((child) => walk(child, interactiveAncestor)));
    }
  };

  view.children.forEach((node) => walk(node));

  for (const reference of references) {
    for (const id of reference.id.split(/\s+/).filter(Boolean)) {
      if (!staticIds.has(id)) {
        diagnostics.warning(
          'VX_A11Y_UNRESOLVED_REFERENCE',
          `Accessibility reference '${id}' is not declared as a static id in this view.`,
          reference.property.span,
          'Declare the target id in this view or ensure the referenced id is provided by an enclosing component.'
        );
      }
    }
  }
}

function validateWidget(widget: WidgetNode, diagnostics: DiagnosticCollector): void {
  const tabIndex = staticNumber(property(widget, 'tabIndex')?.expression);
  if (tabIndex !== undefined && tabIndex > 0) {
    diagnostics.error(
      'VX_A11Y_POSITIVE_TABINDEX',
      `Widget '${widget.tagName}' uses positive tabIndex ${tabIndex}.`,
      property(widget, 'tabIndex')!.span,
      'Use the natural document order, tabIndex 0, or tabIndex -1.'
    );
  }

  const explicitRole = staticString(property(widget, 'role')?.expression);
  if ((explicitRole === 'button' || explicitRole === 'link') && !INTERACTIVE_WIDGETS.has(widget.tagName)) {
    const hasKeyboard = Boolean(property(widget, 'keyDown') || property(widget, 'keyUp') || property(widget, 'keyPress'));
    if (!hasKeyboard) diagnostics.error(
      'VX_A11Y_KEYBOARD_MODEL',
      `Custom ${explicitRole} role requires a keyboard interaction model.`,
      widget.span,
      explicitRole === 'button' ? 'Handle Enter and Space, or use the native Button widget.' : 'Handle Enter, or use the native Link widget.'
    );
  }
  if ((explicitRole === 'dialog' || widget.tagName === 'Dialog') && !hasTextualName(widget, ['title', ...LABEL_PROPERTIES])) {
    diagnostics.error('VX_A11Y_DIALOG_NAME', 'Dialog requires an accessible name.', widget.span, 'Provide title, ariaLabel, or ariaLabelledBy.');
  }
  if (explicitRole === 'alert' && !widget.children.some(containsText) && !widget.callArgument) {
    diagnostics.warning('VX_A11Y_EMPTY_ANNOUNCEMENT', 'Live alert region has no static announcement content.', widget.span, 'Provide content or update it through the announcement runtime.');
  }

  if (staticBoolean(property(widget, 'autoFocus')?.expression) === true) {
    diagnostics.warning(
      'VX_A11Y_AUTOFOCUS',
      `Widget '${widget.tagName}' requests autofocus.`,
      property(widget, 'autoFocus')!.span,
      'Move focus only after an explicit user action or a documented route transition.'
    );
  }

  if (widget.tagName === 'Image') validateImage(widget, diagnostics);
  if (widget.tagName === 'IFrame') requireAccessibleProperty(widget, ['title'], diagnostics, 'VX_A11Y_IFRAME_TITLE', 'IFrame requires a non-empty title.');
  if (FORM_CONTROLS.has(widget.tagName) && !isHiddenInput(widget)) {
    requireAccessibleProperty(
      widget,
      ['label', ...LABEL_PROPERTIES],
      diagnostics,
      'VX_A11Y_CONTROL_NAME',
      `${widget.tagName} requires label, ariaLabel, or ariaLabelledBy.`
    );
  }
  if (widget.tagName === 'Button' && !hasTextualName(widget, ['label', ...LABEL_PROPERTIES])) {
    diagnostics.error(
      'VX_A11Y_BUTTON_NAME',
      'Button requires visible text or an accessible label.',
      widget.span,
      'Provide call text, label, ariaLabel, ariaLabelledBy, or textual children.'
    );
  }
  if (widget.tagName === 'Link' && !hasTextualName(widget, ['text', ...LABEL_PROPERTIES])) {
    diagnostics.error(
      'VX_A11Y_LINK_NAME',
      'Link requires visible text or an accessible label.',
      widget.span,
      'Provide text, ariaLabel, ariaLabelledBy, or textual children.'
    );
  }
  if (widget.tagName === 'Icon' && staticBoolean(property(widget, 'decorative')?.expression) === false) {
    requireAccessibleProperty(widget, LABEL_PROPERTIES, diagnostics, 'VX_A11Y_ICON_NAME', 'Non-decorative Icon requires an accessible label.');
  }
}

function validateImage(widget: WidgetNode, diagnostics: DiagnosticCollector): void {
  const decorative = staticBoolean(property(widget, 'decorative')?.expression) === true;
  const alt = property(widget, 'alt');
  if (!decorative && !alt) {
    diagnostics.error(
      'VX_A11Y_IMAGE_ALT',
      'Image requires alt text or decorative: true.',
      widget.span,
      'Describe the image with alt, or mark it decorative when it conveys no content.'
    );
    return;
  }
  const altText = staticString(alt?.expression);
  if (!decorative && altText === '') {
    diagnostics.error(
      'VX_A11Y_IMAGE_EMPTY_ALT',
      'Informative Image cannot use empty alt text.',
      alt!.span,
      'Provide meaningful alt text or set decorative: true.'
    );
  }
  if (decorative && altText && altText.length > 0) {
    diagnostics.warning(
      'VX_A11Y_DECORATIVE_ALT',
      'Decorative Image also provides non-empty alt text.',
      alt!.span,
      'Remove the alt text or set decorative: false so assistive technology receives the description.'
    );
  }
}

function requireAccessibleProperty(
  widget: WidgetNode,
  names: readonly string[],
  diagnostics: DiagnosticCollector,
  code: string,
  message: string
): void {
  if (names.some((name) => hasMeaningfulProperty(widget, name))) return;
  diagnostics.error(code, message, widget.span, `Provide one of: ${names.join(', ')}.`);
}

function hasTextualName(widget: WidgetNode, properties: readonly string[]): boolean {
  if (widget.callArgument && !isEmptyLiteral(widget.callArgument)) return true;
  if (properties.some((name) => hasMeaningfulProperty(widget, name))) return true;
  return widget.children.some(containsText);
}

function containsText(node: ViewNode): boolean {
  if (node.kind === 'Text') return node.value.trim().length > 0;
  if (node.kind === 'Widget') {
    if (node.tagName === 'Text' || node.tagName === 'Title') return Boolean(node.callArgument && !isEmptyLiteral(node.callArgument));
    return node.children.some(containsText);
  }
  if (node.kind === 'IfBlock') return node.branches.some((branch) => branch.children.some(containsText));
  if (node.kind === 'WhenBlock') return node.branches.some((branch) => branch.children.some(containsText)) || Boolean(node.fallback?.some(containsText));
  return node.children.some(containsText) || node.fallbacks.some((fallback) => fallback.children.some(containsText));
}

function hasMeaningfulProperty(widget: WidgetNode, name: string): boolean {
  const binding = property(widget, name);
  return Boolean(binding && !isEmptyLiteral(binding.expression));
}

function property(widget: WidgetNode, name: string): WidgetProperty | undefined {
  return widget.properties.find((candidate) => candidate.kind === 'PropBinding' && candidate.name === name);
}

function isHiddenInput(widget: WidgetNode): boolean {
  return widget.tagName === 'Input' && staticString(property(widget, 'type')?.expression)?.toLowerCase() === 'hidden';
}

function isEmptyLiteral(expression: ExpressionNode): boolean {
  const text = expression.text.trim();
  return text === '""' || text === "''" || text === '``' || text === 'null' || text === 'undefined';
}

function staticString(expression: ExpressionNode | undefined): string | undefined {
  if (!expression) return undefined;
  const text = expression.text.trim();
  if (text.length < 2) return undefined;
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text.at(-1) !== quote) return undefined;
  try {
    if (quote === '"') return JSON.parse(text) as string;
    return text.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  } catch {
    return undefined;
  }
}

function staticBoolean(expression: ExpressionNode | undefined): boolean | undefined {
  const value = expression?.text.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function staticNumber(expression: ExpressionNode | undefined): number | undefined {
  const value = expression?.text.trim();
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
