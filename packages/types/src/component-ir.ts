/**
 * Target-neutral contracts for resolved VX component projects.
 * These types intentionally exclude filesystem and runtime objects so analysis,
 * tooling, bundlers, and alternate backends can share the same graph safely.
 */
import type {
  ContentCardinality,
  Diagnostic,
  ExecutionSide,
  ProgramNode,
  SourceSpan,
  StoreLifetime,
  ViewSourceMapEntry,
  VisualPartKind,
  VisualRoleDeclarationNode
} from './index.js';

export type ComponentModuleKind = 'component' | 'headless' | 'visual' | 'interop';

export interface ComponentGenericContract {
  name: string;
  constraint?: string;
  span: SourceSpan;
}

export interface ComponentPropContract {
  name: string;
  type: string;
  required: boolean;
  defaultExpression?: string;
  side: ExecutionSide;
  model?: boolean;
  modelOutput?: string;
  span: SourceSpan;
}

export interface ComponentOutputContract {
  name: string;
  type: string;
  span: SourceSpan;
}

export interface ComponentContentContract {
  name: string;
  cardinality: ContentCardinality;
  span: SourceSpan;
}

export interface ComponentVisualPartContract {
  name: string;
  partType: VisualPartKind;
  span: SourceSpan;
}

export interface HeadlessExportContract {
  name: string;
  kind: 'const' | 'derive' | 'query' | 'action' | 'store' | 'schema' | 'form';
  type?: string;
  lifetime?: StoreLifetime;
  reactive: boolean;
  side: ExecutionSide;
  span: SourceSpan;
}

export interface VisualRoleExport {
  name: string;
  declaration: VisualRoleDeclarationNode;
  span: SourceSpan;
}

export interface ComponentForwardingContract {
  attributes: boolean;
  events: boolean;
  class: boolean;
  style: boolean;
}

export interface ComponentContract {
  id: string;
  name: string;
  filePath: string;
  kind: ComponentModuleKind;
  generics: ComponentGenericContract[];
  props: ComponentPropContract[];
  outputs: ComponentOutputContract[];
  content: ComponentContentContract[];
  parts: ComponentVisualPartContract[];
  forwarding: ComponentForwardingContract;
  exports: HeadlessExportContract[];
  /** Exported visual roles — populated only when kind === 'visual'. */
  visualExports: VisualRoleExport[];
}

export interface ResolvedImportBinding {
  local: string;
  imported: 'default' | string;
}

export interface ResolvedComponentImport {
  source: string;
  resolvedPath: string;
  moduleId: string;
  moduleKind: ComponentModuleKind;
  bindings: ResolvedImportBinding[];
  span: SourceSpan;
}

export interface ComponentModuleIR {
  id: string;
  filePath: string;
  source: string;
  ast: ProgramNode;
  contract: ComponentContract;
  imports: ResolvedComponentImport[];
}

export interface ComponentProjectIR {
  rootDir: string;
  entryId: string;
  modules: Map<string, ComponentModuleIR>;
  order: string[];
}

export interface ComponentProjectResult {
  project?: ComponentProjectIR;
  diagnostics: Diagnostic[];
}

export interface ComponentArtifact {
  id: string;
  filePath: string;
  outputFileName: string;
  clientCode: string;
  serverCode: string;
  viewSourceMap: ViewSourceMapEntry[];
  contract: ComponentContract;
}

export interface ComponentProjectBuild {
  entryId: string;
  artifacts: Map<string, ComponentArtifact>;
  diagnostics: Diagnostic[];
}
