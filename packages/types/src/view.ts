import type { BaseNode, Diagnostic, ExpressionNode, ModelDeclaration, ScriptStatement, SourceSpan, TypeExpressionNode } from './ast.js';

// Widget AST
export interface PropBindingNode extends BaseNode {
  kind: 'PropBinding';
  name: string;
  expression: ExpressionNode;
}

export interface EventBindingNode extends BaseNode {
  kind: 'EventBinding';
  name: string;
  expression: ExpressionNode;
}

export type WidgetProperty = PropBindingNode | EventBindingNode;

export interface VisualRoleArgumentNode extends BaseNode {
  kind: 'VisualRoleArgument';
  name: string;
  expression: ExpressionNode;
}

export interface VisualRoleUseNode extends BaseNode {
  kind: 'VisualRoleUse';
  name: string;
  arguments: VisualRoleArgumentNode[];
}

export interface VisualRolePropertyNode extends BaseNode {
  kind: 'VisualRoleProperty';
  name: string;
  expression: ExpressionNode;
}

export interface VisualConditionArgumentNode extends BaseNode {
  kind: 'VisualConditionArgument';
  name?: string;
  expression: ExpressionNode;
}

export interface VisualConditionNode extends BaseNode {
  kind: 'VisualCondition';
  name: string;
  arguments: VisualConditionArgumentNode[];
}

export interface VisualRoleStateNode extends BaseNode {
  kind: 'VisualRoleState';
  /** Kept for tooling compatibility; mirrors condition.name. */
  name: string;
  condition: VisualConditionNode;
  properties: VisualRolePropertyNode[];
}

export interface VisualRoleDeclarationNode extends BaseNode {
  kind: 'VisualRoleDeclaration';
  name: string;
  /** Roles composed into this role. Composition is legal only at definition sites. */
  uses: string[];
  properties: VisualRolePropertyNode[];
  states: VisualRoleStateNode[];
}


export type VisualRoleCategory = 'structural' | 'semantic' | 'visual' | 'interaction' | 'layer';
export type VisualDirection = 'ltr' | 'rtl' | 'auto';
export type VisualWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
export type VisualDensity = 'compact' | 'comfortable' | 'spacious';
export type VisualLayer = 'base' | 'raised' | 'overlay' | 'modal' | 'toast';
export type VisualPropertyMode = 'static' | 'dynamic';

export interface VisualResolvedProperty {
  name: string;
  cssName: string;
  expression: ExpressionNode;
  mode: VisualPropertyMode;
  sourceRole: string;
}

export interface VisualResolvedCondition {
  name: string;
  arguments: VisualConditionArgumentNode[];
  selector?: string;
  media?: string;
  container?: string;
}

export interface VisualResolvedState {
  condition: VisualResolvedCondition;
  properties: VisualResolvedProperty[];
}

export interface VisualResolvedRole {
  name: string;
  category: VisualRoleCategory;
  properties: VisualResolvedProperty[];
  states: VisualResolvedState[];
  sources: string[];
}


export interface VisualResolvedPartBinding {
  name: string;
  structural?: VisualResolvedRole;
  semantic?: VisualResolvedRole;
  classNames: string[];
}

export interface VisualResolvedNode {
  id: string;
  widget: WidgetNode;
  structural?: VisualResolvedRole;
  semantic?: VisualResolvedRole;
  classNames: string[];
  parts: VisualResolvedPartBinding[];
}

export interface VisualDesignRoleDefinition {
  category: VisualRoleCategory;
  properties: Record<string, string>;
  states?: Record<string, Record<string, string>>;
  arguments?: Record<string, string>;
  uses?: string[];
}

export interface VisualDesignSystem {
  name: string;
  roles?: Record<string, VisualDesignRoleDefinition>;
  tokens?: Record<string, string | number>;
  modes?: Record<string, Record<string, string | number>>;
  breakpoints?: Record<string, string | number>;
}

export interface VisualStyleChunkIR { id: string; layer: string; cssText: string; critical: boolean; dependencies: string[]; }
export interface VisualAccessibilityIR { semanticNodes: number; interactiveNodes: number; focusScopes: string[]; announcements: string[]; diagnostics: Diagnostic[]; }
export interface VisualProgramIR {
  scopeId: string;
  nodes: VisualResolvedNode[];
  cssText: string;
  roleNames: string[];
  styleChunks?: VisualStyleChunkIR[];
  accessibility?: VisualAccessibilityIR;
  direction?: VisualDirection;
  writingMode?: VisualWritingMode;
  density?: VisualDensity;
}


export interface ContentRegionUseNode extends BaseNode {
  kind: 'ContentRegionUse';
  name: string;
  children: ViewNode[];
}

export interface VisualPartBindingNode extends BaseNode {
  kind: 'VisualPartBinding';
  name: string;
  roles: VisualRoleUseNode[];
}

export interface WidgetNode extends BaseNode {
  kind: 'Widget';
  tagName: string;
  properties: WidgetProperty[];
  roles: VisualRoleUseNode[];
  children: ViewNode[];
  contentRegions: ContentRegionUseNode[];
  partBindings: VisualPartBindingNode[];
  publicPart?: string;
  forwardTarget?: boolean;
  isCall: boolean;
  callArgument?: ExpressionNode;
}

export type ViewPatternCategory = 'wildcard' | 'literal' | 'named';

export interface ViewPatternNode extends BaseNode {
  kind: 'ViewPattern';
  text: string;
  category: ViewPatternCategory;
  name?: string;
  binding?: string;
  literal?: string | number | boolean | null;
}

export interface IsBranchNode extends BaseNode {
  kind: 'IsBranch';
  pattern: ViewPatternNode;
  /** Compatibility projection for tooling that still displays the old type label. */
  typeAnnotation: TypeExpressionNode;
  children: ViewNode[];
}

export interface StructuralTransitionNode extends BaseNode {
  kind: 'StructuralTransition';
  expression: ExpressionNode;
}

export interface WhenBlockNode extends BaseNode {
  kind: 'WhenBlock';
  expression: ExpressionNode;
  branches: IsBranchNode[];
  fallback?: ViewNode[];
  transition?: StructuralTransitionNode;
}

export interface IfBranchNode extends BaseNode {
  kind: 'IfBranch';
  condition?: ExpressionNode;
  children: ViewNode[];
}

export interface IfBlockNode extends BaseNode {
  kind: 'IfBlock';
  branches: IfBranchNode[];
  /** Compatibility projection of the first branch. */
  condition: ExpressionNode;
  /** Compatibility projection of the first branch. */
  children: ViewNode[];
  transition?: StructuralTransitionNode;
}

export type CollectionFallbackKind = 'loading' | 'empty' | 'error';

export interface CollectionFallbackNode extends BaseNode {
  kind: 'CollectionFallback';
  branch: CollectionFallbackKind;
  binding?: string;
  children: ViewNode[];
}

export interface KeyedCollectionNode extends BaseNode {
  kind: 'KeyedCollection';
  itemName: string;
  indexName?: string;
  collection: ExpressionNode;
  key: ExpressionNode;
  children: ViewNode[];
  fallbacks: CollectionFallbackNode[];
  transition?: StructuralTransitionNode;
}

export interface TextNode extends BaseNode {
  kind: 'Text';
  value: string;
}

export type ViewNode = WidgetNode | WhenBlockNode | IfBlockNode | KeyedCollectionNode | TextNode;

export type ViewSourceKind = 'widget' | 'text' | 'if' | 'when' | 'collection';

export interface ViewSourceMapEntry {
  id: string;
  kind: ViewSourceKind;
  span: SourceSpan;
  generated: {
    startLine: number;
    endLine: number;
  };
}

// Blocks
export interface ScriptBlockNode extends BaseNode {
  kind: 'ScriptBlock';
  statements: ScriptStatement[];
}

export interface ViewBlockNode extends BaseNode {
  kind: 'ViewBlock';
  children: ViewNode[];
  roles: VisualRoleDeclarationNode[];
}

export type TopLevelBlock = ScriptBlockNode | ViewBlockNode | ModelDeclaration;

export interface ProgramNode extends BaseNode {
  kind: 'Program';
  filePath: string;
  blocks: TopLevelBlock[];
}

export type ASTNode = ProgramNode | TopLevelBlock | ScriptStatement | ViewNode | ModelDeclaration;
