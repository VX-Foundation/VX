export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceSpan {
  filePath: string;
  start: SourcePosition;
  end: SourcePosition;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  span: SourceSpan;
  suggestion?: string;
  notes?: string[];
}

export interface BaseNode {
  kind: string;
  span: SourceSpan;
}

export interface IdentifierNode extends BaseNode {
  kind: 'Identifier';
  name: string;
}

export interface TypeExpressionNode extends BaseNode {
  kind: 'TypeExpression';
  text: string;
}

export interface ExpressionNode extends BaseNode {
  kind: 'Expression';
  text: string;
}

export interface ParameterNode extends BaseNode {
  kind: 'Parameter';
  name: string;
  optional?: boolean;
  typeAnnotation?: TypeExpressionNode;
}

export type ExecutionSide = 'client' | 'server';
export type DeclarationVisibility = 'private' | 'public';

export interface DataDeclarationBase extends BaseNode {
  name?: string;
  side: ExecutionSide;
  visibility?: DeclarationVisibility;
}

// Model AST
export interface ModelFieldNode extends BaseNode {
  kind: 'ModelField';
  name: string;
  typeAnnotation: TypeExpressionNode;
}

export interface ModelDeclaration extends BaseNode {
  kind: 'ModelDeclaration';
  name: string;
  fields: ModelFieldNode[];
}

// Component contract AST

export interface ImportSpecifierNode extends BaseNode {
  kind: 'ImportSpecifier';
  imported: string;
  local: string;
}

export interface ImportDeclaration extends DataDeclarationBase {
  kind: 'ImportDeclaration';
  source: string;
  defaultImport?: string;
  specifiers: ImportSpecifierNode[];
}

export interface OutputDeclaration extends DataDeclarationBase {
  kind: 'OutputDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
}

export type ContentCardinality = 'required' | 'optional' | 'multiple';

export interface ContentDeclaration extends DataDeclarationBase {
  kind: 'ContentDeclaration';
  name: string;
  cardinality: ContentCardinality;
}

export type VisualPartKind = 'any' | 'container' | 'text' | 'control' | 'media';

export interface VisualPartDeclaration extends DataDeclarationBase {
  kind: 'VisualPartDeclaration';
  name: string;
  partType: VisualPartKind;
}

export interface GenericDeclaration extends DataDeclarationBase {
  kind: 'GenericDeclaration';
  name: string;
  constraint?: TypeExpressionNode;
}

export interface ModelDeclarationNode extends DataDeclarationBase {
  kind: 'ModelDeclarationNode';
  name: string;
  typeAnnotation: TypeExpressionNode;
  defaultValue: ExpressionNode;
  outputName: string;
}


export interface SchemaRuleNode extends BaseNode {
  kind: 'SchemaRule';
  name: string;
  arguments: ExpressionNode[];
}

export interface SchemaFieldNode extends BaseNode {
  kind: 'SchemaField';
  name: string;
  optional: boolean;
  typeAnnotation: TypeExpressionNode;
  rules: SchemaRuleNode[];
}

export interface SchemaDeclaration extends DataDeclarationBase {
  kind: 'SchemaDeclaration';
  name: string;
  fields: SchemaFieldNode[];
}

export interface FormOptionNode extends BaseNode {
  kind: 'FormOption';
  name: string;
  expression: ExpressionNode;
}

export interface FormDeclaration extends DataDeclarationBase {
  kind: 'FormDeclaration';
  name: string;
  schemaName: string;
  options: FormOptionNode[];
}

export interface ContextProvideDeclaration extends DataDeclarationBase {
  kind: 'ContextProvideDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
  expression: ExpressionNode;
}

export interface ContextInjectDeclaration extends DataDeclarationBase {
  kind: 'ContextInjectDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
  fallback?: ExpressionNode;
}

export type ForwardKind = 'attributes' | 'events' | 'class' | 'style';

export interface ForwardDeclaration extends DataDeclarationBase {
  kind: 'ForwardDeclaration';
  name: ForwardKind;
}

// State AST
export interface PropDeclaration extends DataDeclarationBase {
  kind: 'PropDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
  defaultValue?: ExpressionNode;
}

export interface ConstDeclaration extends DataDeclarationBase {
  kind: 'ConstDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
  initializer: ExpressionNode;
}

export interface StateDeclaration extends DataDeclarationBase {
  kind: 'StateDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
  initializer: ExpressionNode;
}

export interface DeriveDeclaration extends DataDeclarationBase {
  kind: 'DeriveDeclaration';
  name: string;
  typeAnnotation: TypeExpressionNode;
  expression: ExpressionNode;
}

export interface ActionDeclaration extends DataDeclarationBase {
  kind: 'ActionDeclaration';
  name: string;
  parameters: ParameterNode[];
  returnType?: TypeExpressionNode;
  body: string;
}

export interface QueryArgumentNode extends BaseNode {
  kind: 'QueryArgument';
  name: string;
  expression: ExpressionNode;
}

export type QueryExecutionMode = 'universal' | 'server' | 'client';

export interface QueryPolicyEntryNode extends BaseNode {
  kind: 'QueryPolicyEntry';
  name: string;
  expression: ExpressionNode;
}

export interface QueryDeclaration extends DataDeclarationBase {
  kind: 'QueryDeclaration';
  name: string;
  source: ExpressionNode;
  arguments: QueryArgumentNode[];
  policy: QueryPolicyEntryNode[];
}

export interface EffectDeclaration extends DataDeclarationBase {
  kind: 'EffectDeclaration';
  name?: string;
  body: string;
}

export type StoreLifetime = 'component' | 'tree' | 'route' | 'session' | 'application' | 'request' | 'manual';

export interface StoreDeclaration extends DataDeclarationBase {
  kind: 'StoreDeclaration';
  name: string;
  from: string;
  lifetime: StoreLifetime;
}

export type LifecycleDirectiveName = 'mount' | 'unmount' | 'update';

export interface LifecycleDirective extends DataDeclarationBase {
  kind: 'LifecycleDirective';
  name: LifecycleDirectiveName;
  body: string;
}

export type ScriptStatement =
  | ImportDeclaration
  | PropDeclaration
  | ConstDeclaration
  | StateDeclaration
  | DeriveDeclaration
  | QueryDeclaration
  | ActionDeclaration
  | EffectDeclaration
  | StoreDeclaration
  | OutputDeclaration
  | ContentDeclaration
  | VisualPartDeclaration
  | GenericDeclaration
  | ModelDeclarationNode
  | SchemaDeclaration
  | FormDeclaration
  | ContextProvideDeclaration
  | ContextInjectDeclaration
  | ForwardDeclaration
  | LifecycleDirective;

/** @deprecated Use ScriptStatement. */
export type StateStatement = ScriptStatement;
