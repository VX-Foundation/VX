# Changelog

All notable VX changes are documented here. The project follows Semantic Versioning and uses Changesets for package-level release notes.

## 0.1.2 - Unreleased

### Breaking Changes

- **@vx-foundation/compiler**: Added new public APIs for TypeScript integration (`AnalyzeOptions` extended with `rootDir` and `importedContracts`, `analyzeScriptWithTSProgram` signature updated, and new exports: `createTSProgramCacheKey`, `createVirtualCompilerHost`, `generateContractDTS`, `generateVirtualTS`, `generateVisualRoleDTS`, `loadTSConfig`, `mapTSDiagnostic`, `VirtualFileStore`, `VirtualSpanMapping`, `VirtualTSOutput`).

### Runtime & Compiler — Performance, Diagnostics and Security Hardening

- **Runtime Scheduler**: Optimized `pendingCount` in `@vx-foundation/runtime` (`scheduler.ts`) by replacing $O(N)$ array `.reduce()` iterations with $O(1)$ `pendingCounts` Map counters updated on task state transitions.
- **Compiler Dependency Graph**: Updated cycle detection in `@vx-foundation/compiler` (`graph-builder.ts`) by removing the `&& !hasCycle` early exit, enabling full-program traversal that reports all circular dependency diagnostics instead of stopping at the first cycle.
- **URL Sanitization Hardening**: Extended `sanitizeURLAttribute` in `@vx-foundation/runtime` (`security/url.ts`) to sanitize `srcset` candidate URLs, protocol-relative URLs (`//`), and the `data` attribute (e.g. for `<object>` elements).

### Visual System — Advanced Styling Capabilities

- Extended the `.vx` visual role declaration syntax with three new block types: `keyframes { }`, pseudo-element blocks (`before`, `after`, `placeholder`, `selection`, `firstLine`, `firstLetter`, `marker`, `backdrop`), and relational selector blocks (`child`, `has`, `not`, `sibling`, `adjacent`, `is`, `where`).
- Added `css { "..." }` raw CSS escape hatch inside visual role declarations for values that cannot be expressed through the VX visual vocabulary.
- Compiler now emits `@keyframes` blocks scoped to the component (`scopeId-roleName`) and wires the `animation-name` automatically when a role declares a `keyframes` block.
- Pseudo-element rules and relational selector rules are emitted with a `__SELECTOR__` placeholder resolved at emit time, keeping the pipeline composable.
- Added a side-channel `keyframeRegistry` that decouples keyframe registration (`resolveUse`) from emission (`collectKeyframeBlocks`), cleared per compilation pass to avoid stale state.
- Expanded `resolveCondition` with seven new non-dimensional media conditions: `print`, `screen`, `hoverNone`, `coarsePointer`, `forced`, `hdr`, and `reducedData`.
- Extended the visual property vocabulary with CSS Grid shorthand helpers (`gridRows`, `gridAreas`, `gridColumn`, `gridRow`, `autoColumns`, `autoRows`, `autoFlow`), gradient properties, advanced filter properties, and extended animation controls.
- `safe()` in `properties.ts` now returns `UNSAFE_VALUE_SENTINEL` instead of silently discarding unsafe values, enabling early detection in `validateVisualProperty`.

### Visual System — New AST Nodes

- Added `VisualKeyframeStepNode` (stop: `from | to | number`, properties array) to `@vx-foundation/types`.
- Added `VisualPseudoBlockNode` (pseudo name, properties array) to `@vx-foundation/types`.
- Added `VisualSelectorBlockNode` (combinator, selector string, properties array) to `@vx-foundation/types`.
- Extended `VisualRoleDeclarationNode` with optional `keyframes`, `pseudos`, `selectors`, and `rawCss` fields.
- Extended `VisualResolvedRole` with optional `keyframesName`, `pseudoRules`, `selectorRules`, and `rawCss` fields.
- Extended `VisualProgramIR` with optional `keyframeBlocks` field.

### Visual System — Parser

- `view-parser.ts` now parses `keyframes { from { } to { } N% { } }` blocks inside visual role declarations.
- Parser recognises all eight pseudo-element keywords and emits `VisualPseudoBlockNode`.
- Parser recognises all seven relational selector combinators and emits `VisualSelectorBlockNode`.
- Parser parses `css { "raw string" }` and stores the value in `VisualRoleDeclarationNode.rawCss`.

### Visual System — New Diagnostics

- `VX1221 InvalidKeyframeStep` — emitted when a keyframe stop is not `from`, `to`, or a valid percentage.
- `VX1222 InvalidPseudoElement` — emitted when an unrecognised pseudo-element keyword is used.
- `VX1223 InvalidSelectorCombinator` — emitted when an unrecognised relational selector combinator is used.
- `VX1224 InvalidRawCss` — emitted when the `css { }` block contains a malformed or empty value.
- `VX_VISUAL_DUPLICATE_KEYFRAME` — emitted when the same role defines more than one `keyframes` block in the same scope.
- `VX_VISUAL_INVALID_PSEUDO` — emitted at resolve time when a pseudo-element name has no CSS mapping.
- `VX_VISUAL_INVALID_SELECTOR` — emitted at resolve time when a combinator has no CSS mapping or the selector argument is empty.
- `VX_VISUAL_UNSAFE_VALUE` — emitted when a visual property value cannot be safely emitted to CSS.

### Project Templates — Styled Welcome Experience

- All four project templates (`basic`, `starter`, `fullstack`, `library`) now ship with fully styled `.vx` pages using the VX visual system — no raw CSS, no external stylesheets.
- `basic` template: welcome page with logo, display headline, tagline, and a three-button reactive counter (`+`, `Reset`, `−`) with hover/press states and elevation.
- `starter` template: styled top navigation bar with logo, wordmark, and nav links; home page with hero section and reactive counter card; about page with a 2-column feature grid; shared layout with footer.
- `fullstack` template: full-width topbar with brand and doc/GitHub links; hero section with badge, display heading, body copy, CTA buttons, and logo visual; stats row; 3-column feature grid with hover lift effect; shared layout with max-width content container.
- `library` template: `Card.vx` component with header/body regions, description prop, hover elevation, and visual roles for title, description, and body slot.
- All interactive elements (buttons, links, cards) use `transition: fast`, `transform: lift`/`press`, and layered `elevation` tokens for a polished, production-grade feel.

### Visual Modules — Export and Import

- Visual roles can now be marked `exported` inside a `.vx` file, making them available for import by other components.
- `resolveVisualProgram` accepts an `importedVisualRoles` map and merges imported declarations into the effective design system at a precedence layer between the design system and local roles.
- `mergeImportedRolesIntoDesignSystem` converts `VisualRoleDeclarationNode` entries into `VisualDesignRoleDefinition` records so the existing `materializeRole` pipeline resolves them without changes to core logic.
- Added `VX_VISUAL_DUPLICATE_EXPORT` diagnostic for roles exported more than once within the same visual module.

### TypeScript Integration — Real Type Checking for VX Scripts

- Implemented full TypeScript program compilation (`ts.createProgram`) for VX `#script` blocks instead of fragment-based parsing, enabling complete type inference and semantic analysis.
- Added `generateContractDTS` to generate `.d.ts` declarations for VX module contracts (visual, headless, and component modules) with appropriate type exports (`VisualRole`, `VXComponentProps`, `VXComponentOutputs`).
- Extended `generateVirtualTS` to accept `importedContracts` and generate virtual `.d.ts` files for imported VX modules, mapping import paths from `.vx` to `.vx.d.ts`.
- Implemented `loadTSConfig` to load and merge project `tsconfig.json` with VX defaults, respecting user-configured compiler options like lib, JSX, and paths.
- Added content-addressable TS program cache (`TSProgramCache`) with FIFO eviction to avoid expensive recompilation of identical `#script` blocks.
- Implemented hybrid `CompilerHost` that serves virtual TypeScript files (generated code and `.d.ts` dependencies) alongside real filesystem access for standard library resolution.
- Added diagnostic mapper to convert TypeScript diagnostics back to VX source spans, suppressing VX-specific codes (`TS2304`, `TS2307`, `TS2339`, `TS2552`, `TS2540`, `TS2669`, `TS2693`, `TS2749`) that are handled by VX's own semantic passes.
- Updated `analyzeScriptWithTSProgram` to support `rootDir` and `importedContracts` parameters, enabling project-level type checking with proper module resolution for VX imports.
- Added `ScriptTypeCheckResult` interface returning the TS program, type checker, mapped diagnostics, and virtual output for downstream consumers.

### TypeScript Integration — New Modules

- Added `packages/compiler/src/typecheck/contract-dts.ts` — generates `.d.ts` declarations for VX module contracts.
- Added `packages/compiler/src/typecheck/tsconfig-loader.ts` — loads and merges project TypeScript configuration.
- Added `packages/compiler/src/typecheck/index.ts` — unified exports for type checking utilities.
- Added `packages/compiler/test/typescript-integration.test.ts` — comprehensive test suite for TypeScript integration features.

### TypeScript Integration — Updated Modules

- Updated `packages/compiler/src/typecheck/virtual-ts.ts` to accept `importedContracts` and generate `.d.ts` dependencies for VX module imports.
- Updated `packages/compiler/src/typecheck/ts-program-cache.ts` to support project `tsconfig` loading and virtual `.d.ts` file integration.
- Updated `packages/compiler/src/core.ts` to pass `rootDir` and `importedContracts` to TypeScript analysis.
- Updated `packages/compiler/src/project.ts` to provide project root directory to the compiler pipeline.
- Updated `packages/compiler/src/index.ts` to export new type checking utilities.

### TypeScript Integration — Diagnostics

- `TS5074` and `TS6379` errors are now handled gracefully by respecting `composite` project settings and avoiding invalid `incremental` configuration in virtual TS programs.

## 0.1.1 - Unreleased

- Migrated every public npm package from the legacy `@vx/*` namespace to the VX Foundation-owned `@vx-foundation/*` namespace.
- Added the public `@vx-foundation/vx` facade and moved the project generator to `@vx-foundation/create-vx`.
- Fixed clean CI builds by removing generated TypeScript build information from version control and enforcing the rule in repository policy checks.
- Fixed static server loading so compiled server entries can resolve their relative chunks.
- Updated npm bootstrap, package verification, API documentation, and release automation for the 25 synchronized public packages.

This version is intended for the `next` distribution tag. It is not VX 1.0 and does not carry stable compatibility guarantees.

## 0.1.0 - Internal baseline

- Migrated the development toolchain to pnpm 11.17.0, replaced the removed `packageManagerStrictVersion` setting with `pmOnFail`, moved pnpm project settings to `pnpm-workspace.yaml`, and aligned generated templates and release gates with pnpm 11.
- Completed the internal language, compiler, runtime, router, server, data, forms, tooling, package, testing, documentation, and conformance baseline delivered through Phases 1-22.

This version was not published as the VX Foundation npm package line.
