/**
 * Cross-module contract validation for props, outputs, content, visual parts,
 * exports, and client/server boundaries. Invalid graphs never reach codegen.
 */
import type { ComponentModuleIR, ComponentProjectIR } from '@vx-foundation/types';
import type { DiagnosticCollector } from '../analyze/diagnostics.js';
import { findScriptBlock, findViewBlock } from './contract.js';
import { validateContractDeclarations, validateHeadlessModule, validateImports } from './validation-contracts.js';
import { validateComponentView, validateContentOutlets, validateEmits, validatePublicPartMarkers } from './validation-view.js';

export interface ComponentValidationContext {
  module: ComponentModuleIR;
  project: ComponentProjectIR;
}

/** Validates module encapsulation, public contracts, import bindings, and component use sites. */
export function validateComponentModule(context: ComponentValidationContext, diagnostics: DiagnosticCollector): void {
  const { module, project } = context;
  const script = findScriptBlock(module.ast);
  const view = findViewBlock(module.ast);

  validateContractDeclarations(module.contract, script, diagnostics);
  validateImports(module, project, diagnostics);
  validateEmits(module.contract, script, diagnostics);

  if (module.contract.kind === 'component') {
    if (!view) return;
    validateComponentView(module, project, diagnostics);
    validatePublicPartMarkers(module.contract, view.children, diagnostics);
    validateContentOutlets(module.contract, view.children, diagnostics);
    return;
  }
  validateHeadlessModule(module, script, view, diagnostics);
}
