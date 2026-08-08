/**
 * Public widget contract types generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
export type WidgetCategory = "composite" | "control" | "data" | "display" | "feedback" | "form" | "layout" | "media" | "navigation" | "overlay" | "text";
export type WidgetGroup = 'container' | 'text' | 'control' | 'media' | 'formControl' | 'interactive';

export interface WidgetPropertyContract {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue: string | null;
  readonly event: boolean;
}

export interface WidgetEventContract {
  readonly name: string;
  readonly payloadType: string;
}

export interface WidgetContentContract {
  readonly name: string;
  readonly cardinality: 'required' | 'optional' | 'multiple';
  readonly required: boolean;
}

export interface WidgetDefinition {
  readonly name: string;
  readonly category: WidgetCategory;
  readonly nativeElement: string;
  readonly groups: readonly WidgetGroup[];
  readonly callProperty: string | null;
  readonly defaults: Readonly<Record<string, string>>;
  readonly source: string;
  readonly contractSource: string;
  readonly properties: readonly WidgetPropertyContract[];
  readonly events: readonly WidgetEventContract[];
  readonly content: readonly WidgetContentContract[];
}
