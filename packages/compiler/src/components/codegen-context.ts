/**
 * Immutable cross-module information consumed by code generation. Generated
 * imports come only from the previously validated component project graph.
 */
import type { ComponentContract, ComponentModuleKind, HeadlessExportContract } from '@vx-foundation/types';

export interface ComponentCodegenImport {
  local: string;
  imported: 'default' | string;
  moduleId: string;
  specifier: string;
  moduleKind: ComponentModuleKind;
  contract: ComponentContract;
  exported?: HeadlessExportContract;
}

export interface ComponentCodegenContext {
  contract: ComponentContract;
  moduleKind: ComponentModuleKind;
  imports: ComponentCodegenImport[];
}
