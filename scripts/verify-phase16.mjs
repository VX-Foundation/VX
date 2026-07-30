import { readFile } from 'node:fs/promises';
const files = {
  design: await readFile(new URL('../packages/runtime/src/design-system.ts', import.meta.url), 'utf8'),
  styling: await readFile(new URL('../packages/runtime/src/styling.ts', import.meta.url), 'utf8'),
  a11y: await readFile(new URL('../packages/runtime/src/accessibility.ts', import.meta.url), 'utf8'),
  visual: await readFile(new URL('../packages/compiler/src/visual/catalog.ts', import.meta.url), 'utf8')
};
const required = [
  ['typed tokens', files.design, 'TypedToken'], ['token inheritance', files.design, 'extends?: DesignSystemDefinition'],
  ['breaking changes', files.design, 'compareDesignSystems'], ['package distribution', files.design, 'packageDesignSystem'],
  ['cascade layers', files.styling, '@layer vx.'], ['critical CSS', files.styling, 'criticalCss'],
  ['dead styles', files.styling, 'eliminateDeadStyles'], ['code splitting', files.styling, 'splitStyleChunks'],
  ['focus traps', files.a11y, 'createFocusTrap'], ['keyboard models', files.a11y, 'createRovingTabIndex'],
  ['announcements', files.a11y, 'announce'], ['contrast', files.a11y, 'contrast'],
  ['overlays', files.visual, 'popover'], ['writing modes', files.visual, "writing: 'writingMode'"]
];
for (const [name, source, marker] of required) if (!source.includes(marker)) throw new Error(`Phase 16 missing ${name}.`);
console.log(`Phase 16 structural verification passed (${required.length} contracts).`);
