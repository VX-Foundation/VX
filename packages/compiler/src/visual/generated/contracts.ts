/**
 * Compiler widget contract types generated from the canonical registry.
 * DO NOT EDIT: run `pnpm widgets:generate`.
 */
export interface CompilerWidgetDefinition {
  readonly name: string;
  readonly category: string;
  readonly nativeElement: string;
  readonly groups: readonly string[];
  readonly callProperty: string | null;
  readonly defaults: Readonly<Record<string, string>>;
  readonly contractSource: string;
  readonly properties: readonly Readonly<{ name: string; type: string; required: boolean; event: boolean }>[];
  readonly events: readonly Readonly<{ name: string; payloadType: string }>[];
  readonly content: readonly Readonly<{ name: string; cardinality: 'required' | 'optional' | 'multiple'; required: boolean }>[];
}
