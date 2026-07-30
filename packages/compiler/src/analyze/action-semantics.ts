import type { ActionDeclaration } from '@vx/types';
import type { DiagnosticCollector } from './diagnostics.js';

export function validateActionDeclaration(
  action: ActionDeclaration,
  diagnostics: DiagnosticCollector
): void {
  const parameters = new Set<string>();
  for (const parameter of action.parameters) {
    if (parameters.has(parameter.name)) {
      diagnostics.error(
        'VX_ACTION_DUPLICATE_PARAMETER',
        `Action '${action.name}' declares parameter '${parameter.name}' more than once.`,
        parameter.span,
        'Rename or remove the duplicate parameter.'
      );
    }
    parameters.add(parameter.name);
  }

  if (action.side !== 'server') return;
  for (const parameter of action.parameters) {
    if (!parameter.typeAnnotation) {
      diagnostics.error(
        'VX_SERVER_ACTION_PARAMETER_TYPE',
        `Server action '${action.name}' parameter '${parameter.name}' requires an explicit serializable type.`,
        parameter.span,
        'Add a type annotation that can cross the client/server boundary.'
      );
      continue;
    }
    validateSerializableType(action, parameter.typeAnnotation.text, parameter.span, diagnostics, `parameter '${parameter.name}'`);
  }
  if (!action.returnType) {
    diagnostics.error(
      'VX_SERVER_ACTION_RETURN_TYPE',
      `Server action '${action.name}' requires an explicit return type.`,
      action.span,
      "Add ': ResultType' between the parameter list and action body."
    );
  } else {
    validateSerializableType(action, action.returnType.text, action.returnType.span, diagnostics, 'return value');
  }
}

function validateSerializableType(
  action: ActionDeclaration,
  type: string,
  span: ActionDeclaration['span'],
  diagnostics: DiagnosticCollector,
  position: string
): void {
  const normalized = type.replace(/\s+/g, '');
  if (!normalized) return;
  const forbidden = ['Function', 'Promise', 'StateNode', 'QueryResource', 'StoreRegistry', 'AbortSignal', 'Request', 'Response', 'ReadableStream'];
  const matched = forbidden.find((name) => new RegExp(`\\b${name}\\b`).test(normalized));
  if (matched) {
    diagnostics.error(
      'VX_SERVER_ACTION_NON_SERIALIZABLE_TYPE',
      `Server action '${action.name}' ${position} uses non-serializable type '${matched}'.`,
      span,
      'Use primitives, models, lists, records, optionals, or structured result/error types.'
    );
  }
}
