import type {
  ExecutionSide,
  ExpressionNode,
  QueryExecutionMode,
  SourceSpan,
  StoreLifetime,
  TypeExpressionNode
} from './index.js';

export interface QueryPolicyIR {
  staleTimeMs: number;
  retentionTimeMs: number;
  retries: number;
  retryDelayMs: number;
  retryBackoff: 'fixed' | 'exponential';
  execution: QueryExecutionMode;
  networkMode: 'online' | 'always' | 'offline-first';
  deduplicate: boolean;
  refreshOnFocus: boolean;
  refreshOnReconnect: boolean;
  refetchIntervalMs: number;
  structuralSharing: boolean;
  persist: boolean;
  tags: readonly string[];
  enabled?: ExpressionNode;
}

export interface QueryIR {
  kind: 'QueryIR';
  name: string;
  side: ExecutionSide;
  operation: ExpressionNode;
  inputs: Readonly<Record<string, ExpressionNode>>;
  policy: QueryPolicyIR;
  dependencies: readonly string[];
  span: SourceSpan;
}

export interface ActionIR {
  kind: 'ActionIR';
  name: string;
  side: ExecutionSide;
  parameters: readonly { name: string; type?: TypeExpressionNode }[];
  returnType?: TypeExpressionNode;
  asynchronous: boolean;
  dependencies: readonly string[];
  span: SourceSpan;
}

export interface EffectIR {
  kind: 'EffectIR';
  id: string;
  side: ExecutionSide;
  dependencies: readonly string[];
  asynchronous: boolean;
  span: SourceSpan;
}

export interface StoreIR {
  kind: 'StoreIR';
  name: string;
  side: ExecutionSide;
  key: string;
  lifetime: StoreLifetime;
  span: SourceSpan;
}

export interface SchemaFieldIR {
  name: string;
  type: string;
  optional: boolean;
  rules: readonly { name: string; arguments: readonly ExpressionNode[] }[];
  span: SourceSpan;
}

export interface SchemaIR {
  kind: 'SchemaIR';
  name: string;
  fields: SchemaFieldIR[];
  span: SourceSpan;
}

export interface FormIR {
  kind: 'FormIR';
  name: string;
  schemaName: string;
  options: Readonly<Record<string, ExpressionNode>>;
  span: SourceSpan;
}

export interface DataProgramIR {
  schemas: SchemaIR[];
  forms: FormIR[];
  queries: QueryIR[];
  actions: ActionIR[];
  effects: EffectIR[];
  stores: StoreIR[];
}
