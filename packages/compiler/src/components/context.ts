/**
 * Converts a resolved project graph into the narrow symbol view required by
 * semantic analysis. Filesystem access and module discovery never occur here.
 */
import type { ComponentModuleIR, ComponentProjectIR, HeadlessExportContract, VisualRoleDeclarationNode } from '@vx-foundation/types';

export interface ImportedComponentBinding {
  local: string;
  moduleId: string;
}

export interface ImportedValueBinding {
  local: string;
  moduleId: string;
  exported: HeadlessExportContract;
}

export interface ImportedVisualRoleBinding {
  local: string;
  moduleId: string;
  declaration: VisualRoleDeclarationNode;
}

export interface ComponentBindingContext {
  module: ComponentModuleIR;
  project: ComponentProjectIR;
  components: Map<string, ImportedComponentBinding>;
  values: Map<string, ImportedValueBinding>;
  /** Visual roles imported from visual modules, keyed by local name. */
  visualRoles: Map<string, ImportedVisualRoleBinding>;
}

export function createComponentBindingContext(
  module: ComponentModuleIR,
  project: ComponentProjectIR
): ComponentBindingContext {
  const components = new Map<string, ImportedComponentBinding>();
  const values = new Map<string, ImportedValueBinding>();
  const visualRoles = new Map<string, ImportedVisualRoleBinding>();

  for (const imported of module.imports) {
    const target = project.modules.get(imported.moduleId);
    if (!target) continue;

    for (const binding of imported.bindings) {
      if (binding.imported === 'default') {
        components.set(binding.local, { local: binding.local, moduleId: imported.moduleId });
        continue;
      }

      // Named imports from headless modules
      if (target.contract.kind === 'headless') {
        const exported = target.contract.exports.find((item) => item.name === binding.imported);
        if (exported) values.set(binding.local, { local: binding.local, moduleId: imported.moduleId, exported });
        continue;
      }

      // Named imports from visual modules
      if (target.contract.kind === 'visual') {
        const visualExport = target.contract.visualExports.find((item) => item.name === binding.imported);
        if (visualExport) {
          visualRoles.set(binding.local, {
            local: binding.local,
            moduleId: imported.moduleId,
            declaration: visualExport.declaration
          });
        }
        continue;
      }
    }
  }

  return { module, project, components, values, visualRoles };
}
