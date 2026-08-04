import type { ComponentContract, VisualRoleDeclarationNode } from '@vx-foundation/types';

/**
 * Generates a TypeScript declaration file (.d.ts) for a VX module contract.
 * This enables proper type checking when importing VX modules in other VX files.
 */
export function generateContractDTS(contract: ComponentContract): string {
  const lines: string[] = [];
  
  lines.push('// Auto-generated .d.ts for VX module type checking');
  lines.push(`// Module: ${contract.name}`);
  lines.push(`// Kind: ${contract.kind}`);
  lines.push('');
  
  // Generate exports based on module kind
  if (contract.kind === 'component') {
    generateComponentDTS(contract, lines);
  } else if (contract.kind === 'headless') {
    generateHeadlessDTS(contract, lines);
  } else if (contract.kind === 'visual') {
    generateVisualDTS(contract, lines);
  }
  
  return lines.join('\n');
}

function generateComponentDTS(contract: ComponentContract, lines: string[]): void {
  // Default export for components
  lines.push('interface VXComponentProps {');
  for (const prop of contract.props) {
    const optional = prop.required ? '' : '?';
    lines.push(`  ${prop.name}${optional}: ${prop.type};`);
  }
  lines.push('}');
  
  lines.push('');
  lines.push('interface VXComponentOutputs {');
  for (const output of contract.outputs) {
    lines.push(`  ${output.name}: ${output.type};`);
  }
  lines.push('}');
  
  lines.push('');
  lines.push('interface VXComponent {');
  lines.push('  props: VXComponentProps;');
  lines.push('  outputs: VXComponentOutputs;');
  lines.push('}');
  lines.push('');
  lines.push('declare const _default: VXComponent;');
  lines.push('export default _default;');
  
  // Named exports for headless exports from components
  if (contract.exports.length > 0) {
    lines.push('');
    for (const exp of contract.exports) {
      lines.push(`export declare const ${exp.name}: ${exp.type ?? 'any'};`);
    }
  }
}

function generateHeadlessDTS(contract: ComponentContract, lines: string[]): void {
  // Only named exports for headless modules
  for (const exp of contract.exports) {
    lines.push(`export declare const ${exp.name}: ${exp.type ?? 'any'};`);
  }
}

function generateVisualDTS(contract: ComponentContract, lines: string[]): void {
  // VisualRole type declaration
  lines.push('interface VisualRole {');
  lines.push('  readonly name: string;');
  lines.push('  readonly category: "structural" | "semantic" | "visual" | "interaction" | "layer";');
  lines.push('}');
  lines.push('');
  
  // Export each visual role
  for (const exp of contract.visualExports) {
    lines.push(`export declare const ${exp.name}: VisualRole;`);
  }
}

/**
 * Generates a simplified .d.ts for a visual role declaration.
 * Used when roles are imported individually.
 */
export function generateVisualRoleDTS(role: VisualRoleDeclarationNode): string {
  return `declare const _role: {
  name: "${role.name}";
  category: "structural" | "semantic" | "visual" | "interaction" | "layer";
};
export default _role;`;
}
