import type {
  ContentRegionUseNode,
  Diagnostic,
  SourcePosition,
  ViewNode,
  VisualPartBindingNode,
  VisualRoleUseNode
} from '@vx-foundation/types';

import { createDiagnostic, DiagnosticCodes } from './errors.js';
import { type Scanner } from './scanner.js';

export type ParseViewChildren = (scanner: Scanner, diagnostics: Diagnostic[]) => ViewNode[];
export type ParseAttachedVisualRoles = (scanner: Scanner, diagnostics: Diagnostic[]) => VisualRoleUseNode[];

/** Parses one named content provider inside a component use. */
export function parseContentRegionUse(
  scanner: Scanner,
  start: SourcePosition,
  diagnostics: Diagnostic[],
  parseChildren: ParseViewChildren
): ContentRegionUseNode {
  const name = scanner.readIdentifier();
  scanner.skipWhitespaceAndComments();

  if (!name || !scanner.match('{')) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        "Expected 'content <name> { ... }' inside a component use.",
        scanner.span(start)
      )
    );
    return { kind: 'ContentRegionUse', name, children: [], span: scanner.span(start) };
  }

  const children = parseChildren(scanner, diagnostics);
  if (!scanner.match('}')) {
    diagnostics.push(
      createDiagnostic(DiagnosticCodes.ExpectedToken, `Expected '}' to close content region '${name}'.`, scanner.span(start))
    );
  }

  return { kind: 'ContentRegionUse', name, children, span: scanner.span(start) };
}

/** Parses one parent-owned visual override for a public child part. */
export function parseVisualPartBinding(
  scanner: Scanner,
  start: SourcePosition,
  diagnostics: Diagnostic[],
  parseRoles: ParseAttachedVisualRoles
): VisualPartBindingNode {
  const name = scanner.readIdentifier();
  scanner.skipInlineWhitespace();
  const roles = parseRoles(scanner, diagnostics);

  if (!name || roles.length === 0) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.ExpectedToken,
        "Expected 'part <name> @role' inside a component use.",
        scanner.span(start)
      )
    );
  }

  return { kind: 'VisualPartBinding', name, roles, span: scanner.span(start) };
}

/** Separates the compiler-owned @part marker from ordinary visual roles. */
export function extractPublicPart(
  attachedRoles: VisualRoleUseNode[],
  diagnostics: Diagnostic[],
  widgetName: string
): { roles: VisualRoleUseNode[]; publicPart?: string; forwardTarget?: boolean } {
  const directives = attachedRoles.filter((role) => role.name === 'part');
  const forwardDirectives = attachedRoles.filter((role) => role.name === 'forward');
  const roles = attachedRoles.filter((role) => role.name !== 'part' && role.name !== 'forward');
  if (forwardDirectives.length > 1) {
    diagnostics.push(createDiagnostic(
      DiagnosticCodes.DuplicateVisualRole,
      `Widget '${widgetName}' declares more than one @forward marker.`,
      forwardDirectives[1]!.span
    ));
  }
  if (forwardDirectives.some((role) => role.arguments.length > 0)) {
    diagnostics.push(createDiagnostic(
      DiagnosticCodes.InvalidVisualRoleArgument,
      'The @forward marker does not accept arguments.',
      forwardDirectives[0]!.span
    ));
  }
  const forwardTarget = forwardDirectives.length > 0;
  if (directives.length === 0) return { roles, ...(forwardTarget ? { forwardTarget: true } : {}) };

  const directive = directives[0]!;
  if (directives.length > 1) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.DuplicateVisualRole,
        `Widget '${widgetName}' declares more than one public visual part marker.`,
        directive.span
      )
    );
  }

  const argument = directive.arguments.find((item) => item.name === 'name') ?? directive.arguments[0];
  const publicPart = unquote(argument?.expression.text.trim() ?? '');
  if (!publicPart || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(publicPart)) {
    diagnostics.push(
      createDiagnostic(
        DiagnosticCodes.InvalidVisualRoleArgument,
        'The @part directive requires a static identifier: @part(name: title).',
        directive.span
      )
    );
    return { roles, ...(forwardTarget ? { forwardTarget: true } : {}) };
  }

  return { roles, publicPart, ...(forwardTarget ? { forwardTarget: true } : {}) };
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
