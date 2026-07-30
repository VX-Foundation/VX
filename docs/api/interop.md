# @vx/interop

Typed JavaScript and TypeScript interoperability contracts for VX.

Current package line: `0.1.0`.

## Public entries

- `.` → `./dist/index.d.ts`
- `./browser` → `./dist/browser.d.ts`
- `./contracts` → `./dist/contracts.d.ts`
- `./node` → `./dist/node.d.ts`
- `./resolver` → `./dist/resolver.d.ts`
- `./runtime` → `./dist/runtime.d.ts`

## Exported symbols

- `assertBrowserModule` — function in `browser.ts`
- `assertInteropBoundary` — function in `contracts.ts`
- `assertNodeModule` — function in `node.ts`
- `browserApi` — function in `browser.ts`
- `callback` — function in `runtime.ts`
- `clientOnly` — function in `runtime.ts`
- `construct` — function in `runtime.ts`
- `defineInteropModule` — function in `contracts.ts`
- `defineJSClass` — function in `runtime.ts`
- `defineJSFunction` — function in `runtime.ts`
- `DisposableCallback` — interface in `types.ts`
- `environmentCompatible` — function in `contracts.ts`
- `FFIOptions` — interface in `types.ts`
- `InteropDeclaration` — interface in `types.ts`
- `InteropDiagnostic` — interface in `types.ts`
- `InteropEnvironment` — type in `types.ts`
- `InteropErrorPolicy` — type in `types.ts`
- `InteropExportKind` — type in `types.ts`
- `InteropModuleContract` — interface in `types.ts`
- `InteropParameter` — interface in `types.ts`
- `InteropTypeContract` — interface in `types.ts`
- `InteropValueKind` — type in `types.ts`
- `JSClass` — interface in `runtime.ts`
- `JSFunction` — interface in `runtime.ts`
- `normalizeInteropError` — function in `runtime.ts`
- `promiseFrom` — function in `runtime.ts`
- `readableStreamFrom` — function in `runtime.ts`
- `ResolvedInteropPackage` — interface in `types.ts`
- `ResolveInteropPackageOptions` — interface in `resolver.ts`
- `resolveNpmInteropPackage` — function in `resolver.ts`
- `serverOnly` — function in `runtime.ts`
- `treeShakeInterop` — function in `contracts.ts`
- `validateInteropModule` — function in `contracts.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
