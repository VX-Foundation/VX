import type { FormDeclaration, SchemaDeclaration, SchemaFieldNode, ScriptBlockNode } from '@vx-foundation/types';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';

const STRING_RULES = new Map([['min', [1, 2]], ['max', [1, 2]], ['pattern', [1, 2]], ['email', [0, 1]], ['url', [0, 1]], ['trim', [0, 0]], ['sensitive', [0, 0]]]);
const NUMBER_RULES = new Map([['min', [1, 2]], ['max', [1, 2]]]);
const ARRAY_RULES = new Map([['min', [1, 1]], ['max', [1, 1]]]);
const FILE_RULES = new Map([['maxSize', [1, 2]], ['mime', [1, Number.POSITIVE_INFINITY]], ['extension', [1, Number.POSITIVE_INFINITY]]]);
const FORM_OPTIONS = new Set(['action', 'initial', 'method', 'enhance', 'resetOnSuccess', 'validateOn', 'steps', 'focusErrors', 'authorization', 'csrf']);
const BUILT_INS = new Set(['String', 'Email', 'Int', 'Float', 'Number', 'Bool', 'Boolean', 'Date', 'File']);

export function validateForms(script: ScriptBlockNode, diagnostics: DiagnosticCollector): void {
  const schemas = new Map<string, SchemaDeclaration>();
  const forms = new Map<string, FormDeclaration>();
  const actions = new Map(script.statements.filter((statement) => statement.kind === 'ActionDeclaration').map((action) => [action.name, action]));

  for (const statement of script.statements) {
    if (statement.kind === 'SchemaDeclaration') {
      if (schemas.has(statement.name)) diagnostics.error('VX_SCHEMA_DUPLICATE', `Schema '${statement.name}' is declared more than once.`, statement.span);
      else schemas.set(statement.name, statement);
      validateSchemaFields(statement, diagnostics);
    } else if (statement.kind === 'FormDeclaration') {
      if (forms.has(statement.name)) diagnostics.error('VX_FORM_DUPLICATE', `Form '${statement.name}' is declared more than once.`, statement.span);
      else forms.set(statement.name, statement);
    }
  }

  for (const schema of schemas.values()) {
    for (const field of schema.fields) validateFieldType(schema, field, schemas, diagnostics);
  }
  detectSchemaCycles(schemas, diagnostics);

  for (const form of forms.values()) {
    const schema = schemas.get(form.schemaName);
    if (!schema) diagnostics.error('VX_FORM_UNKNOWN_SCHEMA', `Form '${form.name}' references unknown schema '${form.schemaName}'.`, form.span, 'Declare the schema in the same component before using it.');
    const options = new Map<string, FormDeclaration['options'][number]>();
    for (const option of form.options) {
      if (!FORM_OPTIONS.has(option.name)) diagnostics.error('VX_FORM_UNKNOWN_OPTION', `Form '${form.name}' uses unknown option '${option.name}'.`, option.span, `Supported options: ${Array.from(FORM_OPTIONS).join(', ')}.`);
      if (options.has(option.name)) diagnostics.error('VX_FORM_DUPLICATE_OPTION', `Form '${form.name}' declares option '${option.name}' more than once.`, option.span);
      options.set(option.name, option);
    }
    if (!options.has('initial')) diagnostics.error('VX_FORM_INITIAL_REQUIRED', `Form '${form.name}' requires an 'initial' value.`, form.span, `Add 'initial: { ... }' matching schema '${form.schemaName}'.`);
    validateStaticFormOption(form, options.get('method'), ['post', 'put', 'patch'], diagnostics);
    validateStaticFormOption(form, options.get('authorization'), ['public', 'authenticated'], diagnostics);
    validateStaticFormOption(form, options.get('csrf'), ['required', 'same-origin', 'disabled'], diagnostics);
    validateBooleanOption(form, options.get('enhance'), diagnostics);
    validateBooleanOption(form, options.get('resetOnSuccess'), diagnostics);
    validateBooleanOption(form, options.get('focusErrors'), diagnostics);
    validateValidationPhases(form, options.get('validateOn'), diagnostics);
    validateSteps(form, schema, options.get('steps'), diagnostics);

    const actionOption = options.get('action');
    if (actionOption) {
      const actionName = identifier(actionOption.expression.text);
      if (!actionName) diagnostics.error('VX_FORM_ACTION_IDENTIFIER', `Form '${form.name}' action must be a local action identifier.`, actionOption.span);
      else {
        const action = actions.get(actionName);
        if (!action) diagnostics.error('VX_FORM_UNKNOWN_ACTION', `Form '${form.name}' references unknown action '${actionName}'.`, actionOption.span);
        else {
          if (action.side !== 'server') diagnostics.error('VX_FORM_ACTION_SERVER', `Form '${form.name}' action '${actionName}' must be server-owned.`, actionOption.span, "Declare it with 'server action'.");
          if (action.parameters.length !== 1) diagnostics.error('VX_FORM_ACTION_ARITY', `Form action '${actionName}' must accept exactly one schema value.`, action.span);
          const parameterType = action.parameters[0]?.typeAnnotation?.text.replace(/\s+/g, '');
          if (schema && parameterType && parameterType !== schema.name) diagnostics.error('VX_FORM_ACTION_SCHEMA_TYPE', `Form action '${actionName}' receives '${parameterType}', but form '${form.name}' uses schema '${schema.name}'.`, action.parameters[0]!.span);
        }
      }
    }
  }
}

function validateSchemaFields(schema: SchemaDeclaration, diagnostics: DiagnosticCollector): void {
  const fields = new Set<string>();
  for (const field of schema.fields) {
    if (fields.has(field.name)) diagnostics.error('VX_SCHEMA_DUPLICATE_FIELD', `Schema '${schema.name}' declares field '${field.name}' more than once.`, field.span);
    fields.add(field.name);
    const rules = new Set<string>();
    for (const rule of field.rules) {
      if (rules.has(rule.name)) diagnostics.error('VX_SCHEMA_DUPLICATE_RULE', `Field '${schema.name}.${field.name}' applies rule '${rule.name}' more than once.`, rule.span);
      rules.add(rule.name);
    }
  }
}

function validateFieldType(schema: SchemaDeclaration, field: SchemaFieldNode, schemas: ReadonlyMap<string, SchemaDeclaration>, diagnostics: DiagnosticCollector): void {
  const type = normalizeType(field.typeAnnotation.text);
  const item = listItem(type);
  const base = item ?? type;
  if (!BUILT_INS.has(base) && !schemas.has(base)) diagnostics.error('VX_SCHEMA_UNKNOWN_TYPE', `Schema field '${schema.name}.${field.name}' uses unsupported type '${field.typeAnnotation.text}'.`, field.typeAnnotation.span, 'Use a primitive, List<T>, File, or another schema declared in this component.');
  const rules = item ? ARRAY_RULES : ruleCatalog(base);
  for (const rule of field.rules) {
    const arity = rules.get(rule.name);
    if (!arity) {
      diagnostics.error('VX_SCHEMA_RULE_TYPE', `Rule '${rule.name}' is not valid for field '${schema.name}.${field.name}' of type '${field.typeAnnotation.text}'.`, rule.span);
      continue;
    }
    if (rule.arguments.length < arity[0]! || rule.arguments.length > arity[1]!) diagnostics.error('VX_SCHEMA_RULE_ARITY', `Rule '${rule.name}' on '${schema.name}.${field.name}' expects ${formatArity(arity)}, received ${rule.arguments.length}.`, rule.span);
  }
}

function detectSchemaCycles(schemas: ReadonlyMap<string, SchemaDeclaration>, diagnostics: DiagnosticCollector): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (name: string, path: string[]): void => {
    if (visiting.has(name)) {
      diagnostics.error('VX_SCHEMA_CYCLE', `Schema cycle detected: ${[...path, name].join(' -> ')}.`, schemas.get(name)!.span, 'Break the recursive form schema into identifiers or a server-owned custom validator.');
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const schema = schemas.get(name);
    for (const field of schema?.fields ?? []) {
      const type = listItem(normalizeType(field.typeAnnotation.text)) ?? normalizeType(field.typeAnnotation.text);
      if (schemas.has(type)) walk(type, [...path, name]);
    }
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of schemas.keys()) walk(name, []);
}

function ruleCatalog(type: string): ReadonlyMap<string, readonly number[]> {
  if (type === 'String' || type === 'Email') return STRING_RULES;
  if (type === 'Int' || type === 'Float' || type === 'Number') return NUMBER_RULES;
  if (type === 'File') return FILE_RULES;
  return new Map();
}
function normalizeType(type: string): string { return type.replace(/\s+/g, ''); }
function listItem(type: string): string | undefined { return /^List<(.+)>$/.exec(type)?.[1]; }
function identifier(source: string): string | undefined { const value = source.trim(); return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : undefined; }
function formatArity(arity: readonly number[]): string { return arity[0] === arity[1] ? `${arity[0]} argument(s)` : `${arity[0]}–${Number.isFinite(arity[1]!) ? arity[1] : 'many'} arguments`; }
function validateStaticFormOption(form: FormDeclaration, option: FormDeclaration['options'][number] | undefined, values: readonly string[], diagnostics: DiagnosticCollector): void { if (!option) return; const value = staticString(option.expression.text)?.toLowerCase(); if (!value || !values.includes(value)) diagnostics.error('VX_FORM_OPTION_VALUE', `Form '${form.name}' option '${option.name}' must be one of: ${values.join(', ')}.`, option.span); }
function validateBooleanOption(form: FormDeclaration, option: FormDeclaration['options'][number] | undefined, diagnostics: DiagnosticCollector): void { if (!option) return; const value = option.expression.text.trim(); if (value !== 'true' && value !== 'false') diagnostics.error('VX_FORM_OPTION_BOOLEAN', `Form '${form.name}' option '${option.name}' must be a static boolean.`, option.span); }
function staticString(source: string): string | undefined { const value = source.trim(); if (value.length < 2) return undefined; if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1); return undefined; }


function validateValidationPhases(form: FormDeclaration, option: FormDeclaration['options'][number] | undefined, diagnostics: DiagnosticCollector): void {
  if (!option) return;
  const values = staticStringArray(option.expression.text);
  if (!values || values.length === 0 || values.some((value) => !['input', 'change', 'blur', 'submit'].includes(value))) {
    diagnostics.error('VX_FORM_VALIDATE_ON', `Form '${form.name}' option 'validateOn' must be a non-empty static array containing input, change, blur, or submit.`, option.span);
  }
}

function validateSteps(form: FormDeclaration, schema: SchemaDeclaration | undefined, option: FormDeclaration['options'][number] | undefined, diagnostics: DiagnosticCollector): void {
  if (!option) return;
  const steps = staticStringRecord(option.expression.text);
  if (!steps || Object.keys(steps).length === 0) {
    diagnostics.error('VX_FORM_STEPS_VALUE', `Form '${form.name}' option 'steps' must be a non-empty static object whose values are arrays of field paths.`, option.span);
    return;
  }
  const roots = new Set(schema?.fields.map((field) => field.name) ?? []);
  for (const [step, paths] of Object.entries(steps)) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(step) || paths.length === 0) {
      diagnostics.error('VX_FORM_STEP_VALUE', `Form '${form.name}' step '${step}' must have a stable name and at least one field path.`, option.span);
      continue;
    }
    for (const path of paths) {
      const root = path.split(/[.[]/, 1)[0] ?? '';
      if (!root || (schema && !roots.has(root))) diagnostics.error('VX_FORM_STEP_FIELD', `Form '${form.name}' step '${step}' references unknown schema field '${path}'.`, option.span);
    }
  }
}

function staticStringArray(source: string): string[] | undefined {
  const value = source.trim();
  if (!value.startsWith('[') || !value.endsWith(']')) return undefined;
  const body = value.slice(1, -1).trim();
  if (!body) return [];
  const result: string[] = [];
  for (const part of splitStaticList(body)) {
    const parsed = staticString(part);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

function staticStringRecord(source: string): Record<string, string[]> | undefined {
  const value = source.trim();
  if (!value.startsWith('{') || !value.endsWith('}')) return undefined;
  const body = value.slice(1, -1).trim();
  if (!body) return {};
  const result: Record<string, string[]> = Object.create(null);
  for (const entry of splitStaticList(body)) {
    const colon = topLevelColon(entry);
    if (colon < 0) return undefined;
    const keySource = entry.slice(0, colon).trim();
    const key = staticString(keySource) ?? (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(keySource) ? keySource : undefined);
    const fields = staticStringArray(entry.slice(colon + 1));
    if (!key || !fields || Object.hasOwn(result, key)) return undefined;
    result[key] = fields;
  }
  return result;
}

function splitStaticList(source: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '[' || character === '{' || character === '(') depth += 1;
    else if (character === ']' || character === '}' || character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result.filter(Boolean);
}

function topLevelColon(source: string): number {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '[' || character === '{' || character === '(') depth += 1;
    else if (character === ']' || character === '}' || character === ')') depth -= 1;
    else if (character === ':' && depth === 0) return index;
  }
  return -1;
}
