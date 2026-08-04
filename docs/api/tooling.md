# @vx-foundation/tooling

Compiler-backed formatter, language intelligence, inspection, HMR, testing, and migration tools for VX.

Current package line: `0.1.2`.

## Public entries

- `.` -> `./dist/index.js`
- `./formatter` -> `./dist/formatter.js`
- `./hmr` -> `./dist/hmr.js`
- `./inspect` -> `./dist/inspect.js`
- `./language` -> `./dist/language-service.js`
- `./migration` -> `./dist/migration.js`
- `./testing` -> `./dist/testing.js`

## Exported symbols

- `BoundaryInspection` - interface in `inspect.ts`
- `CallHierarchyNode` - interface in `types.ts`
- `CodeAction` - interface in `types.ts`
- `collectReferences` - function in `symbols.ts`
- `collectSemanticTokens` - function in `semantic.ts`
- `collectSymbols` - function in `symbols.ts`
- `compareHMRSignatures` - function in `hmr.ts`
- `CompletionEntry` - interface in `types.ts`
- `ComponentHarness` - interface in `testing.ts`
- `createCallHierarchy` - function in `hierarchy.ts`
- `createComponentHarness` - function in `testing.ts`
- `createHMRSignature` - function in `hmr.ts`
- `createTypeHierarchy` - function in `hierarchy.ts`
- `FormatOptions` - interface in `formatter.ts`
- `FormatResult` - interface in `formatter.ts`
- `formatVX` - function in `formatter.ts`
- `HierarchyItem` - interface in `types.ts`
- `HMRCompatibility` - interface in `hmr.ts`
- `HMRSignature` - interface in `hmr.ts`
- `indexVXWorkspace` - function in `workspace.ts`
- `InlayHintEntry` - interface in `types.ts`
- `inspectVX` - function in `inspect.ts`
- `migrateVXSource` - function in `migration.ts`
- `MigrationChange` - interface in `migration.ts`
- `MigrationResult` - interface in `migration.ts`
- `offsetToPosition` - function in `symbols.ts`
- `pathToUri` - function in `workspace.ts`
- `printCanonicalVX` - function in `formatter.ts`
- `ReactiveInspectionNode` - interface in `inspect.ts`
- `SemanticTokenEntry` - interface in `types.ts`
- `SemanticTokenType` - type in `types.ts`
- `SymbolKind` - type in `types.ts`
- `SymbolReference` - interface in `types.ts`
- `TextEdit` - interface in `types.ts`
- `TypeHierarchyNode` - interface in `types.ts`
- `VXDocumentSnapshot` - interface in `types.ts`
- `VXInspection` - interface in `inspect.ts`
- `VXLanguageService` - class in `language-service.ts`
- `VXSymbol` - interface in `types.ts`
- `wordAtOffset` - function in `symbols.ts`
- `WorkspaceDocument` - interface in `hierarchy.ts`
- `WorkspaceIndexOptions` - interface in `types.ts`
- `WorkspaceIndexResult` - interface in `types.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
