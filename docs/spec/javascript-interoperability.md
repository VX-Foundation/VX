# JavaScript and TypeScript Interoperability

VX resolves npm packages through installed package metadata and conditional exports.

## Resolution

The ESM resolver uses applicable `types`, `browser`, `import`, `node`, and `default` conditions. An explicitly blocked export MUST remain blocked and cannot fall back to `main`.

## Declarations

TypeScript declarations may come from conditional exports, `types`, `typings`, `typesVersions`, or an adjacent declaration file. Missing declarations produce a diagnostic at typed boundaries.

## FFI

The public FFI supports functions, callbacks, promises, streams, async iterables, classes, browser APIs, and Node APIs. Each boundary declares execution side and serialization behavior.

## Side restrictions

Server-only modules cannot enter client graphs. Client-only modules cannot enter server graphs. Boundary violations are compile-time errors.

## Tree shaking

Public package metadata and side-effect declarations inform dead-code elimination. FFI wrappers MUST not manufacture side effects that prevent safe tree shaking.
