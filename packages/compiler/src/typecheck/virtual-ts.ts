import type { ScriptBlockNode, SourceSpan, ComponentContract } from '@vx-foundation/types';
import { generateContractDTS } from './contract-dts.js';

export interface VirtualSpanMapping {
  virtualStart: number;
  virtualEnd: number;
  originalSpan: SourceSpan;
}

export interface VirtualTSOutput {
  code: string;
  filePath: string;
  mappings: VirtualSpanMapping[];
  /** Additional virtual .d.ts files generated for imported VX modules */
  dependencies: Map<string, string>;
}

function normalizeExpr(text: string): string {
  if (text.trim() === 'none') return 'null';
  return text;
}

function normalizeType(text?: string): string {
  const trimmed = text?.trim();
  if (!trimmed) return 'any';
  return trimmed;
}

/**
 * Transforms a VX #script block AST into a virtual TypeScript source string
 * and builds a location map for tracing TS diagnostics back to the .vx file.
 * 
 * @param script - The script block to transform
 * @param filePath - The original .vx file path
 * @param importedContracts - Optional map of imported VX module contracts for type generation
 */
export function generateVirtualTS(
  script: ScriptBlockNode | undefined,
  filePath: string,
  importedContracts?: Map<string, ComponentContract>
): VirtualTSOutput {
  const mappings: VirtualSpanMapping[] = [];
  const lines: string[] = [];
  const dependencies = new Map<string, string>();
  let currentOffset = 0;

  function append(text: string, originalSpan?: SourceSpan): void {
    const start = currentOffset;
    lines.push(text);
    currentOffset += text.length + 1; // +1 for \n
    if (originalSpan) {
      mappings.push({
        virtualStart: start,
        virtualEnd: currentOffset - 1,
        originalSpan
      });
    }
  }

  append('// Auto-generated virtual TS module for VX #script analysis');
  // 'export {}' makes this file an ES module so that 'declare global' is valid (TS2669).
  append('export {};');
  append('declare global {');
  append('  var $event: Event;');
  append('  var none: any;');
  append('  type Bool = boolean;');
  append('  type Any = any;');
  append('  type Void = void;');
  append('}');

  if (!script) {
    return { code: lines.join('\n'), filePath, mappings, dependencies };
  }

  let effectCount = 0;

  for (const statement of script.statements) {
    switch (statement.kind) {
      case 'ImportDeclaration': {
        const specs = statement.specifiers
          .map((s) => (s.imported === s.local ? s.imported : `${s.imported} as ${s.local}`))
          .join(', ');
        const def = statement.defaultImport ? `${statement.defaultImport}${specs ? ', ' : ''}` : '';
        const clause = def || specs ? `${def}${specs ? `{ ${specs} }` : ''} from ` : '';
        
        // Check if this is a VX module import
        if (statement.source.endsWith('.vx') && importedContracts?.has(statement.source)) {
          // Generate .d.ts for the imported VX module
          const contract = importedContracts.get(statement.source)!;
          const dtsPath = `${statement.source}.d.ts`;
          const dtsContent = generateContractDTS(contract);
          dependencies.set(dtsPath, dtsContent);
          
          // Import from the virtual .d.ts file
          append(`import ${clause}'${dtsPath}';`, statement.span);
        } else {
          // Regular import (JS/TS or unresolved VX import)
          append(`import ${clause}'${statement.source}';`, statement.span);
        }
        break;
      }
      case 'PropDeclaration': {
        const typeStr = normalizeType(statement.typeAnnotation.text);
        append(`export declare const ${statement.name}: ${typeStr};`, statement.span);
        if (statement.defaultValue) {
          append(`const __check_prop_${statement.name}: ${typeStr} = (${normalizeExpr(statement.defaultValue.text)});`, statement.defaultValue.span);
        }
        break;
      }
      case 'ConstDeclaration': {
        const typeStr = normalizeType(statement.typeAnnotation.text);
        append(`export declare const ${statement.name}: ${typeStr};`, statement.span);
        if (statement.initializer) {
          append(`const __check_const_${statement.name}: ${typeStr} = (${normalizeExpr(statement.initializer.text)});`, statement.initializer.span);
        }
        break;
      }
      case 'StateDeclaration': {
        const typeStr = normalizeType(statement.typeAnnotation.text);
        append(`export declare let ${statement.name}: ${typeStr};`, statement.span);
        if (statement.initializer) {
          append(`const __check_state_${statement.name}: ${typeStr} = (${normalizeExpr(statement.initializer.text)});`, statement.initializer.span);
        }
        break;
      }
      case 'DeriveDeclaration': {
        const typeStr = normalizeType(statement.typeAnnotation.text);
        append(`export declare const ${statement.name}: ${typeStr};`, statement.span);
        if (statement.expression) {
          append(`const __check_derive_${statement.name}: ${typeStr} = (${normalizeExpr(statement.expression.text)});`, statement.expression.span);
        }
        break;
      }
      case 'ActionDeclaration': {
        const params = statement.parameters
          .map((p) => `${p.name}${p.optional ? '?' : ''}: ${normalizeType(p.typeAnnotation?.text)}`)
          .join(', ');
        const retType = normalizeType(statement.returnType?.text);
        const ret = retType !== 'any' ? `: Promise<${retType}>` : ': Promise<void>';
        append(`export async function ${statement.name}(${params})${ret} {\n${statement.body}\n}`, statement.span);
        break;
      }
      case 'EffectDeclaration': {
        effectCount += 1;
        append(`function __vx_effect_${effectCount}() {\n${statement.body}\n}`, statement.span);
        break;
      }
      case 'QueryDeclaration':
      case 'StoreDeclaration':
      case 'SchemaDeclaration':
      case 'FormDeclaration':
      case 'ContextInjectDeclaration':
      case 'ContextProvideDeclaration': {
        if (statement.name) {
          append(`export declare const ${statement.name}: any;`, statement.span);
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    code: lines.join('\n'),
    filePath,
    mappings,
    dependencies
  };
}
