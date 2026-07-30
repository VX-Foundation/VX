/**
 * Conservative cross-component type checks. The checker proves supported
 * expression shapes and returns Unknown for unsupported syntax instead of
 * guessing, which keeps diagnostics sound while the full type system evolves.
 */
import type {
  ComponentGenericContract,
  ComponentModuleIR,
  ComponentProjectIR,
  ExpressionNode,
  ScriptStatement,
  WidgetNode
} from '@vx/types';
import ts from 'typescript';

import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import { findScriptBlock } from './contract.js';

export type ContractType = string | 'Unknown';

/** Builds the local type environment used for cross-component contract checks. */
export function buildContractTypeEnvironment(
  module: ComponentModuleIR,
  project: ComponentProjectIR
): Map<string, string> {
  const types = new Map<string, string>();
  for (const statement of findScriptBlock(module.ast)?.statements ?? []) {
    const type = declarationType(statement);
    if (type && statement.name) types.set(statement.name, type);
  }
  for (const imported of module.imports) {
    const target = project.modules.get(imported.moduleId);
    if (!target) continue;
    for (const binding of imported.bindings) {
      if (binding.imported === 'default') continue;
      const exported = target.contract.exports.find((item) => item.name === binding.imported);
      if (exported?.type) types.set(binding.local, exported.type);
    }
  }
  return types;
}

/** Validates statically inferable component prop expressions without guessing unknown types. */
export function validateComponentPropTypes(
  node: WidgetNode,
  expected: ReadonlyMap<string, string>,
  environment: ReadonlyMap<string, string>,
  diagnostics: DiagnosticCollector,
  generics: readonly ComponentGenericContract[] = []
): void {
  const inferred = new Map<string, string>();
  const genericMap = new Map(generics.map((generic) => [generic.name, generic]));
  if (node.isCall && node.callArgument) {
    const required = Array.from(expected.entries()).filter(([, type]) => !isOptional(type));
    if (required.length === 1) validateExpression(required[0]![0], required[0]![1], node.callArgument, environment, diagnostics, genericMap, inferred);
  }
  for (const property of node.properties) {
    if (property.kind !== 'PropBinding') continue;
    const target = expected.get(property.name);
    if (target) validateExpression(property.name, target, property.expression, environment, diagnostics, genericMap, inferred);
  }
}

function validateExpression(
  propName: string,
  expected: string,
  expression: ExpressionNode,
  environment: ReadonlyMap<string, string>,
  diagnostics: DiagnosticCollector,
  generics: ReadonlyMap<string, ComponentGenericContract>,
  inferred: Map<string, string>
): void {
  const actual = inferExpressionType(expression.text, environment);
  if (actual === 'Unknown') return;
  const resolved = inferGenericBindings(actual, expected, generics, inferred, diagnostics, expression);
  if (resolved && isContractTypeAssignable(actual, substituteGenerics(expected, inferred))) return;
  diagnostics.error(
    'VX_COMPONENT_PROP_TYPE',
    `Prop '${propName}' expects '${expected}', but the supplied expression is '${actual}'.`,
    expression.span
  );
}


function inferGenericBindings(
  actual: string,
  expected: string,
  generics: ReadonlyMap<string, ComponentGenericContract>,
  inferred: Map<string, string>,
  diagnostics: DiagnosticCollector,
  expression: ExpressionNode
): boolean {
  const target = normalizeType(expected);
  const source = normalizeType(actual);
  if (generics.has(target)) {
    const previous = inferred.get(target);
    if (previous && !isContractTypeAssignable(source, previous) && !isContractTypeAssignable(previous, source)) {
      diagnostics.error(
        'VX_COMPONENT_GENERIC_CONFLICT',
        `Generic '${target}' was inferred as both '${previous}' and '${source}' in the same component use.`,
        expression.span
      );
      return false;
    }
    const generic = generics.get(target)!;
    if (generic.constraint && !isContractTypeAssignable(source, generic.constraint)) {
      diagnostics.error(
        'VX_COMPONENT_GENERIC_CONSTRAINT',
        `Generic '${target}' requires '${generic.constraint}', but '${source}' was supplied.`,
        expression.span
      );
      return false;
    }
    inferred.set(target, previous ?? source);
    return true;
  }
  const targetGeneric = splitGeneric(target);
  const sourceGeneric = splitGeneric(source);
  if (targetGeneric && sourceGeneric && targetGeneric.name === sourceGeneric.name && targetGeneric.arguments.length === sourceGeneric.arguments.length) {
    return targetGeneric.arguments.every((argument, index) =>
      inferGenericBindings(sourceGeneric.arguments[index]!, argument, generics, inferred, diagnostics, expression)
    );
  }
  return true;
}

function substituteGenerics(type: string, inferred: ReadonlyMap<string, string>): string {
  const normalized = normalizeType(type);
  const direct = inferred.get(normalized);
  if (direct) return direct;
  const generic = splitGeneric(normalized);
  if (!generic) return normalized;
  return `${generic.name}<${generic.arguments.map((argument) => substituteGenerics(argument, inferred)).join(',')}>`;
}

function splitGeneric(type: string): { name: string; arguments: string[] } | undefined {
  const open = type.indexOf('<');
  if (open < 1 || !type.endsWith('>')) return undefined;
  const body = type.slice(open + 1, -1);
  const arguments_: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= body.length; index += 1) {
    const character = body[index];
    if (character === '<') depth += 1;
    else if (character === '>') depth -= 1;
    else if ((character === ',' || index === body.length) && depth === 0) {
      arguments_.push(body.slice(start, index));
      start = index + 1;
    }
  }
  return { name: type.slice(0, open), arguments: arguments_.filter(Boolean) };
}

export function inferExpressionType(
  source: string,
  environment: ReadonlyMap<string, string>
): ContractType {
  const file = ts.createSourceFile(
    'component-contract-expression.ts',
    `const __vx = (${source});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const statement = file.statements.find(ts.isVariableStatement);
  const expression = statement?.declarationList.declarations[0]?.initializer;
  return expression ? inferNode(expression, environment) : 'Unknown';
}

function inferNode(node: ts.Expression, environment: ReadonlyMap<string, string>): ContractType {
  if (ts.isParenthesizedExpression(node)) return inferNode(node.expression, environment);
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return 'String';
  if (ts.isNumericLiteral(node)) return node.text.includes('.') ? 'Float' : 'Int';
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return 'Bool';
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'Null';
  if (ts.isIdentifier(node)) return environment.get(node.text) ?? 'Unknown';
  if (ts.isArrayLiteralExpression(node)) {
    const elementTypes = node.elements
      .filter(ts.isExpression)
      .map((element) => inferNode(element, environment));
    const known = elementTypes.filter((type) => type !== 'Unknown');
    if (known.length === 0) return 'List<Unknown>';
    return known.every((type) => normalizeType(type) === normalizeType(known[0]!))
      ? `List<${known[0]}>`
      : 'List<Unknown>';
  }
  if (ts.isConditionalExpression(node)) {
    const left = inferNode(node.whenTrue, environment);
    const right = inferNode(node.whenFalse, environment);
    return normalizeType(left) === normalizeType(right) ? left : 'Unknown';
  }
  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.ExclamationToken) return 'Bool';
    return inferNode(node.operand, environment);
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.EqualsEqualsToken ||
      operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      operator === ts.SyntaxKind.ExclamationEqualsToken ||
      operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      operator === ts.SyntaxKind.LessThanToken ||
      operator === ts.SyntaxKind.LessThanEqualsToken ||
      operator === ts.SyntaxKind.GreaterThanToken ||
      operator === ts.SyntaxKind.GreaterThanEqualsToken ||
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken
    ) return 'Bool';
    if (operator === ts.SyntaxKind.PlusToken) {
      const left = inferNode(node.left, environment);
      const right = inferNode(node.right, environment);
      if (left === 'String' || right === 'String') return 'String';
      if (left === 'Float' || right === 'Float') return 'Float';
      if (left === 'Int' && right === 'Int') return 'Int';
    }
  }
  return 'Unknown';
}

export function isContractTypeAssignable(actual: string, expected: string): boolean {
  const target = normalizeType(expected);
  const source = normalizeType(actual);
  if (target === 'Any' || target === 'Unknown' || source === target) return true;
  if (target === 'Float' && source === 'Int') return true;
  const optional = unwrapGeneric(target, 'Optional');
  if (optional) return source === 'Null' || isContractTypeAssignable(source, optional);
  const expectedList = unwrapGeneric(target, 'List');
  const actualList = unwrapGeneric(source, 'List');
  if (expectedList && actualList) return actualList === 'Unknown' || isContractTypeAssignable(actualList, expectedList);
  return false;
}

function isOptional(type: string): boolean {
  return unwrapGeneric(normalizeType(type), 'Optional') !== undefined;
}

function normalizeType(type: string): string {
  return type.replace(/\s+/g, '');
}

function unwrapGeneric(type: string, name: string): string | undefined {
  const prefix = `${name}<`;
  return type.startsWith(prefix) && type.endsWith('>') ? type.slice(prefix.length, -1) : undefined;
}

function declarationType(statement: ScriptStatement): string | undefined {
  switch (statement.kind) {
    case 'PropDeclaration':
    case 'ModelDeclarationNode':
    case 'ContextInjectDeclaration':
    case 'ConstDeclaration':
    case 'StateDeclaration':
    case 'DeriveDeclaration':
      return statement.typeAnnotation.text;
    case 'ActionDeclaration':
      return statement.returnType?.text;
    default:
      return undefined;
  }
}
