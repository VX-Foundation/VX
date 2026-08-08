# @vx-foundation/devtools

Browser DevTools protocol, inspector store, performance timeline, and runtime bridge for VX.

Current package line: `0.2.0`.

## Public entries

- `.` -> `./dist/index.d.ts`
- `./bridge` -> `./dist/bridge.d.ts`
- `./protocol` -> `./dist/protocol.d.ts`

## Exported symbols

- `createDevtoolsBridge` - function in `bridge.ts`
- `createWindowTransport` - function in `transport.ts`
- `DevtoolsBridge` - interface in `bridge.ts`
- `DevtoolsCategory` - type in `protocol.ts`
- `DevtoolsEntity` - interface in `protocol.ts`
- `DevtoolsEvent` - interface in `protocol.ts`
- `DevtoolsMetric` - interface in `protocol.ts`
- `DevtoolsSnapshot` - interface in `protocol.ts`
- `DevtoolsStore` - class in `store.ts`
- `DevtoolsTransport` - interface in `protocol.ts`
- `getGlobalDevtoolsBridge` - function in `bridge.ts`
- `installGlobalDevtoolsBridge` - function in `bridge.ts`
- `VX_DEVTOOLS_SYMBOL` - const in `bridge.ts`

## Stability

Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.
