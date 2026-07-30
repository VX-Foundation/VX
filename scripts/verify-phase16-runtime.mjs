import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../packages/runtime/src/design-system.ts', import.meta.url), 'utf8');
for (const marker of ['resolveDesignTokens', 'validateTokens', 'compareDesignSystems', 'installDesignSystem']) if (!source.includes(`function ${marker}`)) throw new Error(`Missing runtime function ${marker}.`);
const a11y = await readFile(new URL('../packages/runtime/src/accessibility.ts', import.meta.url), 'utf8');
for (const marker of ['accessibleName', 'createFocusTrap', 'auditAccessibility']) if (!a11y.includes(`function ${marker}`)) throw new Error(`Missing accessibility runtime ${marker}.`);
console.log('Phase 16 runtime contract verification passed.');
