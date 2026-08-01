import type { FormIR, SchemaIR } from '@vx-foundation/types';
import { lowerExpression, type JavaScriptBinding } from '../codegen/javascript.js';

export function emitSchemas(schemas: readonly SchemaIR[], bindings: ReadonlyMap<string, JavaScriptBinding>, indent = ''): string {
  const ordered = orderSchemas(schemas);
  return ordered.map((entry) => `${indent}const ${entry.name} = ${emitSchema(entry, bindings)};`).join('\n') + (ordered.length ? '\n' : '');
}

export function emitClientForms(
  forms: readonly FormIR[],
  bindings: ReadonlyMap<string, JavaScriptBinding>,
  indent = '  ',
  componentId = 'component',
  stateRoot = 'undefined'
): string {
  let code = '';
  for (const form of forms) {
    const options = form.options;
    const initial = options['initial'] ? lowerExpression(options['initial'].text, { bindings }) : '{}';
    const action = options['action']?.text.trim();
    const validateOn = options['validateOn'] ? lowerExpression(options['validateOn'].text, { bindings }) : "['blur', 'submit']";
    const steps = options['steps'] ? lowerExpression(options['steps'].text, { bindings }) : 'undefined';
    const reset = options['resetOnSuccess']?.text.trim() ?? 'false';
    const enhance = options['enhance']?.text.trim() ?? 'true';
    const focusErrors = options['focusErrors']?.text.trim() ?? 'true';
    const method = (staticString(options['method']?.text) ?? 'post').toLowerCase();
    const formId = `${componentId}:${form.name}`;
    const serverAction = action ? JSON.stringify(`/_vx/form/${encodeURIComponent(formId)}`) : 'undefined';
    const hydratedState = stateRoot === 'undefined' ? 'undefined' : `${stateRoot}?.[${JSON.stringify(formId)}]`;
    code += `${indent}const ${form.name} = createForm({ id: ${JSON.stringify(formId)}, schema: ${form.schemaName}, initialValues: ${initial}, state: ${hydratedState}, action: ${serverAction}, method: ${JSON.stringify(method)}, enhance: ${enhance}, focusErrors: ${focusErrors}, validateOn: ${validateOn}, steps: ${steps}, resetOnSuccess: ${reset}`;
    if (action) code += `, submit: async ({ values }) => ${action}(values)`;
    code += ` });\n${indent}__vxCleanup.push(() => ${form.name}.cancel());\n`;
  }
  return code;
}

export function emitServerFormHandlers(forms: readonly FormIR[], componentId = 'component'): string {
  let code = '';
  for (const form of forms) {
    const action = form.options['action']?.text.trim();
    if (!action) continue;
    const method = (staticString(form.options['method']?.text) ?? 'post').toUpperCase();
    const authorization = (staticString(form.options['authorization']?.text) ?? 'authenticated').toLowerCase();
    const csrf = (staticString(form.options['csrf']?.text) ?? 'required').toLowerCase();
    const formId = `${componentId}:${form.name}`;
    code += `export const ${form.name}FormContract = registerServerForm(${JSON.stringify({ id: formId, name: form.name, schema: form.schemaName, method, authorization, csrf })}, { schema: ${form.schemaName}, method: ${JSON.stringify(method)}, authorization: ${JSON.stringify(authorization)}, csrf: ${JSON.stringify(csrf)}, action: ({ values }) => ${action}(values) });\n\n`;
  }
  return code;
}

function emitSchema(entry: SchemaIR, bindings: ReadonlyMap<string, JavaScriptBinding>): string {
  const fields = entry.fields.map((field) => {
    let expression = emitType(field.type, bindings);
    for (const rule of field.rules) {
      const args = rule.arguments.map((argument) => lowerExpression(argument.text, { bindings })).join(', ');
      expression += `.${rule.name}(${args})`;
    }
    if (field.optional) expression = `schema.optional(${expression})`;
    return `${JSON.stringify(field.name)}: ${expression}`;
  });
  return `schema.object({ ${fields.join(', ')} })`;
}

function emitType(typeSource: string, bindings: ReadonlyMap<string, JavaScriptBinding>): string {
  const type = typeSource.replace(/\s+/g, '');
  const list = /^List<(.+)>$/.exec(type);
  if (list) return `schema.array(${emitType(list[1]!, bindings)})`;
  if (type === 'String') return 'schema.string()';
  if (type === 'Email') return 'schema.email()';
  if (type === 'Int') return 'schema.integer()';
  if (type === 'Float' || type === 'Number') return 'schema.number()';
  if (type === 'Bool' || type === 'Boolean') return 'schema.boolean()';
  if (type === 'Date') return 'schema.date()';
  if (type === 'File') return 'schema.file()';
  return lowerExpression(type, { bindings });
}

function orderSchemas(schemas: readonly SchemaIR[]): SchemaIR[] {
  const byName = new Map(schemas.map((entry) => [entry.name, entry]));
  const result: SchemaIR[] = [];
  const visited = new Set<string>();
  const visit = (entry: SchemaIR): void => {
    if (visited.has(entry.name)) return;
    visited.add(entry.name);
    for (const field of entry.fields) {
      const type = /^List<(.+)>$/.exec(field.type.replace(/\s+/g, ''))?.[1] ?? field.type.replace(/\s+/g, '');
      const dependency = byName.get(type);
      if (dependency) visit(dependency);
    }
    result.push(entry);
  };
  for (const entry of schemas) visit(entry);
  return result;
}
function staticString(source: string | undefined): string | undefined { if (!source) return undefined; const value = source.trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1); return undefined; }
