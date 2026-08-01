import type {
  ActionIR,
  DataProgramIR,
  EffectIR,
  QueryIR,
  ScriptBlockNode,
  StoreIR,
  SchemaIR,
  FormIR
} from '@vx-foundation/types';
import { bodyContainsAwait } from '../codegen/javascript.js';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import type { ReactiveGraph } from '../analyze/graph-builder.js';
import { resolveQueryPolicy } from './policy.js';

export function buildDataProgram(
  script: ScriptBlockNode | undefined,
  graph: ReactiveGraph,
  diagnostics: DiagnosticCollector
): DataProgramIR {
  const program: DataProgramIR = { schemas: [], forms: [], queries: [], actions: [], effects: [], stores: [] };
  if (!script) return program;

  let anonymousEffectIndex = 0;
  for (const statement of script.statements) {
    const graphId = statement.name ?? (statement.kind === 'EffectDeclaration' ? `__effect_${anonymousEffectIndex}` : undefined);
    const dependencies = graphId ? Array.from(graph.nodes.get(graphId)?.dependencies ?? []) : [];
    switch (statement.kind) {
      case 'SchemaDeclaration': {
        const schema: SchemaIR = {
          kind: 'SchemaIR',
          name: statement.name,
          fields: statement.fields.map((field) => ({
            name: field.name,
            type: field.typeAnnotation.text,
            optional: field.optional,
            rules: field.rules.map((rule) => ({ name: rule.name, arguments: rule.arguments })),
            span: field.span
          })),
          span: statement.span
        };
        program.schemas.push(schema);
        break;
      }
      case 'FormDeclaration': {
        const form: FormIR = {
          kind: 'FormIR',
          name: statement.name,
          schemaName: statement.schemaName,
          options: Object.fromEntries(statement.options.map((option) => [option.name, option.expression])),
          span: statement.span
        };
        program.forms.push(form);
        break;
      }
      case 'QueryDeclaration': {
        const inputs = Object.fromEntries(statement.arguments.map((argument) => [argument.name, argument.expression]));
        const query: QueryIR = {
          kind: 'QueryIR',
          name: statement.name,
          side: statement.side,
          operation: statement.source,
          inputs,
          policy: resolveQueryPolicy(statement, diagnostics),
          dependencies,
          span: statement.span
        };
        program.queries.push(query);
        break;
      }
      case 'ActionDeclaration': {
        const action: ActionIR = {
          kind: 'ActionIR',
          name: statement.name,
          side: statement.side,
          parameters: statement.parameters.map((parameter) => ({
            name: parameter.name,
            ...(parameter.typeAnnotation ? { type: parameter.typeAnnotation } : {})
          })),
          ...(statement.returnType ? { returnType: statement.returnType } : {}),
          asynchronous: bodyContainsAwait(statement.body) || statement.side === 'server',
          dependencies,
          span: statement.span
        };
        program.actions.push(action);
        break;
      }
      case 'EffectDeclaration': {
        const effect: EffectIR = {
          kind: 'EffectIR',
          id: statement.name ?? `effect:${anonymousEffectIndex}`,
          side: statement.side,
          dependencies,
          asynchronous: bodyContainsAwait(statement.body),
          span: statement.span
        };
        program.effects.push(effect);
        if (!statement.name) anonymousEffectIndex += 1;
        break;
      }
      case 'StoreDeclaration': {
        const store: StoreIR = {
          kind: 'StoreIR',
          name: statement.name,
          side: statement.side,
          key: statement.from,
          lifetime: statement.lifetime,
          span: statement.span
        };
        program.stores.push(store);
        break;
      }
      default:
        break;
    }
  }
  return program;
}
