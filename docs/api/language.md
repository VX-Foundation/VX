# @vx-foundation/language

Tokenizer, parser and AST for the VX .vx single-file component language.

Current package line: `0.1.2`.

## Public entries

- `.` -> `./dist/index.d.ts`

## Exported symbols

- `BLOCK_KINDS` - const in `tokens.ts`
- `BlockKind` - type in `tokens.ts`
- `createDiagnostic` - function in `errors.ts`
- `CreateDiagnosticOptions` - interface in `errors.ts`
- `DiagnosticCodes` - const in `errors.ts`
- `extractPublicPart` - function in `component-view-parser.ts`
- `isBlockKind` - function in `tokens.ts`
- `parse` - function in `parser.ts`
- `parseAction` - function in `script-data-parser.ts`
- `ParseAttachedVisualRoles` - type in `component-view-parser.ts`
- `parseComputed` - function in `script-state-parser.ts`
- `parseConst` - function in `script-state-parser.ts`
- `parseContentDeclaration` - function in `component-contract-parser.ts`
- `parseContentRegionUse` - function in `component-view-parser.ts`
- `parseContextInjectDeclaration` - function in `component-contract-parser.ts`
- `parseContextProvideDeclaration` - function in `component-contract-parser.ts`
- `ParsedViewPattern` - interface in `view-pattern.ts`
- `parseEffect` - function in `script-data-parser.ts`
- `parseFormDeclaration` - function in `script-schema-parser.ts`
- `parseForwardDeclaration` - function in `component-contract-parser.ts`
- `parseGenericDeclaration` - function in `component-contract-parser.ts`
- `parseIfBlock` - function in `view-control-parser.ts`
- `parseImportDeclaration` - function in `component-contract-parser.ts`
- `parseKeyedCollection` - function in `view-control-parser.ts`
- `parseLifecycleDirective` - function in `script-lifecycle-parser.ts`
- `parseModelDeclaration` - function in `component-contract-parser.ts`
- `parseOutputDeclaration` - function in `component-contract-parser.ts`
- `parseProp` - function in `script-state-parser.ts`
- `parseQuery` - function in `script-data-parser.ts`
- `parseSchemaDeclaration` - function in `script-schema-parser.ts`
- `parseScriptBlock` - function in `script-parser.ts`
- `parseState` - function in `script-state-parser.ts`
- `parseStore` - function in `script-data-parser.ts`
- `parseViewBlock` - function in `view-parser.ts`
- `ParseViewChildren` - type in `component-view-parser.ts`
- `ParseViewNodeList` - type in `view-control-parser.ts`
- `parseViewPattern` - function in `view-pattern.ts`
- `parseVisualPartBinding` - function in `component-view-parser.ts`
- `parseVisualPartDeclaration` - function in `component-contract-parser.ts`
- `parseWhenBlock` - function in `view-control-parser.ts`
- `readBraceBody` - function in `expression.ts`
- `readBracketedExpression` - function in `expression.ts`
- `readLineExpression` - function in `expression.ts`
- `readParenExpression` - function in `expression.ts`
- `readStringLiteralRaw` - function in `expression.ts`
- `readStringLiteralValue` - function in `expression.ts`
- `recoverToNextLine` - function in `script-parser-utils.ts`
- `Scanner` - class in `scanner.ts`
- `Token` - type in `tokens.ts`
- `tokenize` - function in `tokenizer.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
