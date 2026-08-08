import type {
  ViewBlockNode,
  ViewNode,
  ExpressionNode,
  WidgetProperty,
} from '@vx-foundation/types';
import type { DiagnosticCollector } from './diagnostics.js';
import type { ReactiveGraph } from './graph-builder.js';
import type { ComponentBindingContext } from '../components/context.js';
import { collectReferencedIdentifiers } from './expression-identifiers.js';
import { WIDGET_REGISTRY } from '../visual/primitives.js';
import { expandInterpolatedExpression } from '../interpolation.js';

const primitivePropsCache = new Map<string, Set<string>>();
const GLOBAL_WIDGET_PROPERTIES = new Set([
  'id', 'role', 'tabIndex', 'ariaLabel', 'ariaLabelledBy', 'ariaDescribedBy', 'ariaControls', 'ariaExpanded',
  'ariaPressed', 'ariaCurrent', 'ariaLive', 'ariaAtomic', 'ariaHidden', 'dataTestId'
]);

/** Reads the generated public contract produced from the canonical widget registry. */
function getPrimitiveProps(tagName: string): Set<string> | null {
  const cached = primitivePropsCache.get(tagName);
  if (cached) return cached;

  const definition = WIDGET_REGISTRY[tagName as keyof typeof WIDGET_REGISTRY];
  if (!definition) return null;

  const props = new Set(definition.properties.map((property) => property.name));
  primitivePropsCache.set(tagName, props);
  return props;
}

/**
 * Checks all expressions in the `#view` block against the `#script` graph,
 * and validates that widgets are passed correct properties based on their .vx signatures.
 */
export function checkViewTypes(
  viewBlock: ViewBlockNode,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector,
  component?: ComponentBindingContext
) {
  // Start with the root scope containing all declarations from #script
  const rootScope = new Set(graph.nodes.keys());
  for (const name of component?.values.keys() ?? []) rootScope.add(name);
  for (const name of component?.components.keys() ?? []) rootScope.add(name);
  if (component?.module.contract.kind === 'component') rootScope.add('Self');
  // Built-in globals
  const globals = new Set(['console', 'Math', 'Date', 'String', 'Number', 'Boolean', 'Object', 'Array', 'JSON', 'Promise', '$event']);

  function checkExpression(expr: ExpressionNode, localScope: Set<string>) {
    const interpolation = expandInterpolatedExpression(expr?.text || '');
    const sources = interpolation.expressions.length > 0 ? interpolation.expressions : [expr?.text || ''];
    const idents = new Set<string>();
    for (const source of sources) {
      for (const ident of collectReferencedIdentifiers(source)) idents.add(ident);
    }
    for (const ident of idents) {
      if (!localScope.has(ident) && !globals.has(ident)) {
        diagnostics.error(
          'VX_UNDECLARED_VARIABLE',
          `Cannot find name '${ident}'. It is not declared in #script nor provided by local context.`,
          expr.span,
          `Declare 'state ${ident}' or 'prop ${ident}' in the #script block.`
        );
      }
    }
  }

  function walkProperty(prop: WidgetProperty, widgetName: string, localScope: Set<string>) {
    // 1. Check expression scope validity
    checkExpression(prop.expression, localScope);

    // 2. Check if the primitive accepts this property (if it's a known primitive)
    const acceptedProps = getPrimitiveProps(widgetName);
    if (acceptedProps) {
      // It's a primitive widget. Verify the property exists.
      if (!acceptedProps.has(prop.name) && !GLOBAL_WIDGET_PROPERTIES.has(prop.name) && prop.name !== 'key' && prop.name !== 'ref') {
        // Special case for 'key' or 'ref' if we want them globally, but for now strict checking
        diagnostics.error(
          'VX_UNKNOWN_PROPERTY',
          `Property '${prop.name}' does not exist on primitive widget '${widgetName}'.`,
          prop.span,
          `Check the signature of '${widgetName}.vx' in @vx-foundation/widgets.`
        );
      }
    }
  }

  function walk(node: ViewNode, currentScope: Set<string>) {
    switch (node.kind) {
      case 'Widget': {
        if (node.isCall && node.callArgument && node.tagName !== 'Content') {
          checkExpression(node.callArgument, currentScope);
        }

        for (const prop of node.properties) {
          walkProperty(prop, node.tagName, currentScope);
        }
        for (const binding of node.partBindings) {
          for (const role of binding.roles) {
            for (const argument of role.arguments) checkExpression(argument.expression, currentScope);
          }
        }
        for (const child of node.children) walk(child, currentScope);
        for (const region of node.contentRegions) {
          for (const child of region.children) walk(child, currentScope);
        }
        break;
      }

      case 'IfBlock': {
        for (const branch of node.branches) {
          if (branch.condition) checkExpression(branch.condition, currentScope);
          for (const child of branch.children) walk(child, currentScope);
        }
        if (node.transition) checkExpression(node.transition.expression, currentScope);
        break;
      }

      case 'WhenBlock': {
        checkExpression(node.expression, currentScope);
        for (const branch of node.branches) {
          const branchScope = extendScope(currentScope, branch.pattern.binding, branch.pattern.span, diagnostics);
          for (const child of branch.children) walk(child, branchScope);
        }
        for (const child of node.fallback ?? []) walk(child, currentScope);
        if (node.transition) checkExpression(node.transition.expression, currentScope);
        break;
      }

      case 'KeyedCollection': {
        checkExpression(node.collection, currentScope);
        let itemScope = extendScope(currentScope, node.itemName, node.span, diagnostics);
        itemScope = extendScope(itemScope, node.indexName, node.span, diagnostics);
        checkExpression(node.key, itemScope);
        for (const child of node.children) walk(child, itemScope);
        for (const fallback of node.fallbacks) {
          const fallbackScope = fallback.branch === 'error'
            ? extendScope(currentScope, fallback.binding, fallback.span, diagnostics)
            : currentScope;
          for (const child of fallback.children) walk(child, fallbackScope);
        }
        if (node.transition) checkExpression(node.transition.expression, currentScope);
        break;
      }

      case 'Text':
        break; // Nothing to check
    }
  }

  function extendScope(
    scope: Set<string>,
    name: string | undefined,
    span: ViewNode['span'],
    collector: DiagnosticCollector
  ): Set<string> {
    if (!name) return scope;
    if (scope.has(name)) {
      collector.error(
        'VX_VIEW_SCOPE_COLLISION',
        `View binding '${name}' shadows an existing declaration in the same visual scope.`,
        span,
        'Rename the branch or collection binding to preserve unambiguous source mapping.'
      );
    }
    const next = new Set(scope);
    next.add(name);
    return next;
  }

  for (const child of viewBlock.children) {
    walk(child, rootScope);
  }
}
