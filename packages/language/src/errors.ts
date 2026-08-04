import type { Diagnostic, SourceSpan } from '@vx-foundation/types';

/**
 * Stable diagnostic codes for the tokenizer and parser.
 *
 * Codes are namespaced by stage: 1000s for top-level structure, 1100s for
 * `#script`, and 1200s for `#view`. Compiler diagnostics use semantic names
 * so parser codes can remain stable as later phases evolve.
 */
export const DiagnosticCodes = {
  UnknownBlockKind: 'VX1001',
  UnterminatedBlock: 'VX1002',
  DuplicateBlock: 'VX1003',
  MismatchedBlockEnd: 'VX1004',
  SyntaxError: 'VX1005',
  SupersededBlock: 'VX1006',

  UnknownDataStatement: 'VX1101',
  ExpectedToken: 'VX1102',
  UnterminatedLifecycleBlock: 'VX1103',
  SupersededScriptStatement: 'VX1104',

  UnknownViewDirective: 'VX1201',
  EventBindingAtNodePosition: 'VX1202',
  UnterminatedInterpolation: 'VX1203',
  MismatchedTag: 'VX1204',
  UnterminatedTag: 'VX1205',
  UnterminatedDirective: 'VX1206',
  DisallowedDirectiveContent: 'VX1207',
  InvalidVisualRole: 'VX1208',
  DuplicateVisualRole: 'VX1209',
  InvalidVisualRoleArgument: 'VX1210',
  InvalidVisualRoleDeclaration: 'VX1211',
  InvalidIfContract: 'VX1212',
  InvalidWhenContract: 'VX1213',
  InvalidViewPattern: 'VX1214',
  InvalidCollectionContract: 'VX1215',
  DuplicateViewBranch: 'VX1216',
  UnreachableViewBranch: 'VX1217',
  InvalidStructuralTransition: 'VX1218',

  // Visual module export/import diagnostics
  VisualExportOutsideScope: 'VX1219',
  VisualExportInComponentBody: 'VX1220',

  // Visual role advanced syntax diagnostics
  InvalidKeyframeStep: 'VX1221',
  InvalidPseudoElement: 'VX1222',
  InvalidSelectorCombinator: 'VX1223',
  InvalidRawCss: 'VX1224'
} as const;

export interface CreateDiagnosticOptions {
  suggestion?: string;
  notes?: string[];
}

export function createDiagnostic(
  code: string,
  message: string,
  span: SourceSpan,
  options: CreateDiagnosticOptions = {}
): Diagnostic {
  return {
    code,
    message,
    severity: 'error',
    span,
    ...(options.suggestion !== undefined ? { suggestion: options.suggestion } : {}),
    ...(options.notes !== undefined ? { notes: options.notes } : {})
  };
}
