# VX Workspace Package Map

This document defines package ownership and communication boundaries for the current VX implementation. It is descriptive, not a substitute for package public APIs or the phase specifications.

## Governing boundaries

- Build-time packages must not leak into client output.
- Generated client code may import only documented runtime entrypoints.
- Filesystem and package resolution belong to compiler/bundler boundaries, never the runtime.
- Parsing, semantic analysis, IR construction, code generation, and execution remain separate responsibilities.
- Orchestrators coordinate modules; they do not absorb subsystem implementation.
- All authored content is English and every authored file remains below 1000 lines.

## Package overview

| Unit | Primary side | Browser output | Responsibility |
|---|---|---:|---|
| `@vx-foundation/types` | shared types | erased | AST, IR, contracts, diagnostics |
| `@vx-foundation/shared` | build time | no | pure utilities and hashing |
| `@vx-foundation/language` | build time | playground only | scanner, parser, AST construction |
| `@vx-foundation/compiler` | build time | playground only | analysis, graphs, IR, secure component projects, lowering |
| `@vx-foundation/widgets` | build time metadata | no | canonical primitive contracts |
| `@vx-foundation/runtime` | runtime | yes | selected reactive, DOM, data, visual, and component primitives |
| `@vx-foundation/forms` | split | client and server slices | schemas, form state, progressive enhancement, secure form dispatch, and accessibility |
| `@vx-foundation/data` | split | client and server slices | persistence, offline mutations, infinite data, realtime transports, and cache synchronization |
| `@vx-foundation/router` | split | client and server slices | final route graph, typed URLs, matching, middleware, loaders, navigation, metadata, and rendering coordination |
| `@vx-foundation/server` | server | no | request contexts, cookies, sessions, middleware, endpoints, authorization, security, observability, and production adapters |
| `@vx-foundation/bundler` | build time | no | Vite integration, artifact graph, adapters |
| `@vx-foundation/dev-server` | build time | no | development orchestration and HMR foundation |
| `@vx-foundation/core` | build time | no | configuration and framework orchestration |
| `@vx-foundation/package-system` | developer/build time | no | package metadata, workspaces, `vx.lock`, integrity, signatures, and mutations |
| `@vx-foundation/interop` | split contract | selected helpers | npm/TypeScript declarations, FFI, streams, classes, and environment boundaries |
| `@vx-foundation/devtools` | development runtime | development only | inspector protocol, bounded store, bridge, and transport contracts |
| `@vx-foundation/plugins` | isolated build workers | no by default | versioned, capability-mediated integrations |
| `@vx-foundation/cli` | developer machine | no | command parsing and dispatch |
| `@vx-foundation/language-server` | editor process | no | diagnostics and language features |
| `vx-vscode` | editor extension | no | VS Code client and grammar |
| `@vx-foundation/create-vx` | developer machine | no | project scaffolding entrypoint |
| `@vx-foundation/playground` | standalone browser app | yes | browser-hosted compiler demonstration |

## `packages/types`

**Owns:**

- source positions and diagnostics;
- models and program AST nodes;
- reactive, visual, and data IR;
- component contracts and `ComponentProjectIR`;
- public compiler/runtime configuration types.

**Does not own:** parsing, validation, filesystem access, or execution.

The package has no runtime dependency on compiler or language packages.

## `packages/shared`

**Owns:** pure cross-package utilities such as deterministic content hashing.

**Rules:**

- no `.vx` grammar knowledge;
- no DOM or server platform logic;
- no package orchestration;
- no hidden global state.

## `packages/language`

**Owns:**

- scanner and source traversal;
- `#script` and `#view` parsing;
- script declarations;
- component import and contract syntax;
- component content and visual-part syntax;
- view-tree construction;
- source spans and recoverable syntax diagnostics.

**Current internal boundaries:**

```text
script-parser
view-parser
component-contract-parser
component-view-parser
expression helpers
scanner
diagnostics
```

The language package does not resolve imports or validate component contracts across files.

## `packages/compiler`

**Owns:**

- symbols, scopes, expression dependencies, and mutation rules;
- client/server partition analysis;
- reactive graph construction;
- Visual IR and Data Program IR;
- secure component-project resolution;
- component contract extraction and cross-module validation;
- dependency-first lowering;
- direct DOM/client code generation;
- server artifact foundations.

### Component subsystem

```text
components/contract         immutable public contracts
components/resolver         canonical filesystem/package graph
components/context          semantic binding context
components/validation       cross-module contract rules
components/contract-types   conservative use-site checks
components/package-resolver automatic package boundary resolution
package/discovery            convention-based public API discovery
package/manifest             generated metadata and integrity
package/builder              publication staging orchestration
components/semver            deterministic package compatibility
codegen/component-module    validated ESM dependency glue
codegen/component-factory   lifecycle factories
project                     project-level orchestration
```

`compileComponentProject()` is the public project-level entrypoint. It resolves and validates the complete graph before emitting executable artifacts.

### Security boundary

The compiler rejects:

- dynamic, URL, absolute, query, fragment, and backslash imports;
- traversal and symlink boundary escapes;
- import cycles and graph resource-limit violations;
- private package imports, generated integrity failures, and incompatible package versions;
- invalid component props, outputs, content regions, and parts;
- unsafe public member names;
- invalid client/server captures and imports.

## `packages/widgets`

**Owns:** canonical primitive signatures and categories used by parser/compiler validation.

Primitives are metadata contracts, not runtime widget classes. The compiler lowers known primitives directly to target operations.

A custom visual component must be resolved through the component project graph; it cannot silently fall back to a generic primitive.

## `packages/runtime`

**Owns only execution primitives selected by compiled output.** It does not parse source, resolve visual roles, inspect package manifests, or discover components.

Current module groups:

```text
state and derives
DOM bindings and events
visual properties and themes
query runtime
action runtime
effect runtime
store registry and lifetimes
component props, outputs, content, parts, and ranges
client/request runtime contexts
```

### Component ownership

- parent expressions own prop signals;
- child components borrow prop signals;
- outputs use closed dispatch tables;
- projected content mounts without wrapper nodes;
- public visual-part overrides target only compiler-declared nodes;
- nested component and headless resources dispose deterministically.

Public runtime entrypoints:

```text
@vx-foundation/runtime
@vx-foundation/runtime/client
@vx-foundation/runtime/server
```

## `packages/data`

**Owns:**

- opt-in query-cache persistence and restoration;
- cross-context cache synchronization;
- persisted offline mutation queues;
- infinite-query page orchestration;
- WebSocket/EventSource realtime clients;
- server peer hubs and backplane contracts.

It consumes the query/action contracts from `@vx-foundation/runtime`. It does not implement compiler semantics, route discovery, authentication, or vendor-specific storage/message-broker adapters.

## `packages/router`

**Owns:**

- canonical and compatibility filesystem-route discovery;
- typed path and search contracts;
- named route catalogs and URL generation;
- compiled matching for immutable production graphs;
- inherited layouts and route boundaries;
- hierarchical loaders and middleware;
- client navigation, history, blockers, focus, scroll, preload, and accessible announcements;
- server route and endpoint dispatch;
- rendering, hydration, streaming, generation, metadata, redirect, and preservation policies.

The router consumes compiler-owned component contracts and generated modules. It does not independently implement VX component semantics.

## `packages/server`

**Owns:**

- request-local platform context and lifecycle;
- cookie and session contracts;
- application middleware and authorization policies;
- bounded body and endpoint helpers;
- security headers, CORS, and rate-limiter contracts;
- structured logging, tracing, environment validation, and server timing;
- Node HTTP bridging, static assets, compression, and graceful shutdown.

The package wraps `@vx-foundation/router/server`; it does not rediscover routes, reimplement rendering, or own compiler semantics. Distributed stores and vendor observability exporters remain adapters over public contracts.

## `packages/bundler`

**Owns:**

- VX Vite plugin integration;
- compilation of complete component graphs;
- private virtual modules for dependency artifacts;
- source-file watch registration;
- diagnostic location forwarding;
- adapter and production graph foundations.

The bundler never resolves component contracts independently. It calls `@vx-foundation/compiler/project` and consumes emitted artifacts.

HMR recompiles the affected graph and compares compiler-derived component, state, store, and query signatures. Compatible remounts preserve route-level query/store runtime state; incompatible changes reload explicitly.

## `packages/dev-server`

**Owns:** local server orchestration, middleware, file watching, and development error propagation.

It reuses bundler/compiler contracts and must not maintain a second parser or component resolver.

## `packages/core`

**Owns:** framework-level orchestration:

```text
configuration
language/compiler/router/bundler coordination
development and build entrypoints
integration lifecycle
```

`core` must remain an orchestrator. Parsing, graph algorithms, code generation, adapter implementation, and runtime behavior belong to their dedicated packages.

## `packages/package-system`

**Owns:** canonical package metadata, conditional exports, public-contract snapshots and compatibility detection, recursive workspace graphs, `vx.lock`, publication manifests, integrity, Ed25519 signatures, dependency mutations, deprecation, and migration metadata. Lockfiles never encode absolute developer-machine paths.

## `packages/interop`

**Owns:** installed npm entrypoint and declaration resolution, conditional and wildcard exports, client/server boundary checks, typed FFI, disposable callbacks, abortable promises, Web Streams conversion, class construction, and tree-shaking contracts. It does not make unsafe imports portable; it diagnoses the boundary.

## `packages/devtools`

**Owns:** the development-only inspector protocol, bounded entity/event/metric stores, the runtime bridge, redaction, and transport-neutral snapshots. Production behavior must not depend on DevTools being present.

## `packages/plugins`

**Owns:** the versioned integration API, policy enforcement, Worker isolation, lifecycle hooks, timeout/cancellation, persistent deterministic caching, confined project reads, confined output writes, detached source-integrity manifests, Ed25519 signatures, and curated official plugins.

Plugins do not receive general filesystem, process, environment, network, or child-process access. A capability is public only when the host provides a mediated implementation. Tailwind and MDX were removed because they were symbolic; sitemap remains because it executes as a real isolated plugin.

Signed plugins use a detached `vx.plugin.json` so source integrity can cover executable code without a circular embedded hash. Normal installation requires the isolated loader; audited first-party code must opt into `installTrusted()` explicitly.

## `packages/cli`

**Owns:** argument parsing, user-facing diagnostics, and dispatch into framework orchestration.

Command implementations should remain small. Plugin commands that are not implemented must fail honestly rather than silently modifying project files.

## `packages/tooling`

**Owns:** the shared compiler-backed development API:

- canonical formatting;
- versioned documents, symbols, definitions, references, rename, completions, and code actions;
- Reactive Graph, Visual IR, client/server boundary, generated-output, and source-map inspection;
- HMR compatibility signatures;
- component harnesses and browser fixture boundaries;
- deterministic legacy migration.

Tooling consumes `@vx-foundation/language` and `@vx-foundation/compiler`; it does not maintain a parallel parser or semantic model.

## `packages/language-server`

**Owns:** editor-process diagnostics and language vocabulary.

Current features include parser/analyzer diagnostics and completions for:

- script/view regions;
- reactive and data declarations;
- component imports and contracts;
- outputs, content regions, visual parts, and `emit`;
- visual roles and managed runtime helpers.

The server delegates semantic navigation, references, rename, document symbols, formatting, and code actions to `@vx-foundation/tooling`. Project-wide import-graph indexing beyond open compiler documents remains release-hardening work.

## `packages/vscode-extension`

**Owns:** VS Code activation, language-client startup, and TextMate grammar.

The extension does not embed a second compiler. It starts the shared Language Server, stages its server entry during extension builds, sends compiler-inspection requests over LSP, and contributes syntax highlighting/configuration.

## `apps/create-vx`

**Owns:** the `create-vx` executable and delegation to the public CLI scaffolding contract.

It must not import unpublished internal CLI files.

## `apps/playground`

**Owns:** a standalone browser compiler explorer where `@vx-foundation/tooling` runs in a Web Worker and exposes live preview, diagnostics, Reactive/Visual IR, client/server boundaries, source maps, and generated client/server output.

The playground is not shipped with generated applications and is not evidence of production sandboxing or browser security conformance.

## Templates

Templates are copied project trees, not workspace packages.

A template must:

- use only published package entrypoints;
- avoid `workspace:*` in distributable output;
- contain syntax implemented by the selected VX release;
- pass parser, analyzer, compiler, and clean consumer-install checks before release.

## End-to-end package flow

```text
entry .vx file
  → bundler plugin
  → compileComponentProject()
  → canonical project/package resolver
  → ComponentProjectIR
  → per-module semantic/reactive/visual/data analysis
  → dependency-first ESM artifacts
  → private bundler virtual modules
  → generated output imports @vx-foundation/runtime/client
  → wrapper-free mount and deterministic cleanup
```

## Verification ownership

```text
repository policy      English and authored-file limits
phase verifiers        executable compiler/runtime contracts
package-layout check   published paths, declarations, and bin shebangs
TypeScript builds      cross-package type integration
Vitest/browser E2E     complete clean-install environment required
```

A package or syntax node is not considered complete until its language contract, validation, lowering, runtime behavior, diagnostics, tests, documentation, and distribution path agree.


## `packages/release`

**Owns:** generated public API snapshots, semantic-version compatibility classification, package publication policy, channel planning, and deterministic provenance manifests.

It reads generated declarations and package manifests only. It must not compile VX source, publish automatically, infer repository identity, or weaken stable-release gates.


## @vx-foundation/forms

Typed schema validation, form controllers, progressive enhancement, multipart decoding, accessible field bindings, registered server form dispatch, and SSR-native form helpers. Public entrypoints: `.`, `./client`, and `./server`.

- `@vx-foundation/testing`: official deterministic testing contracts for every framework layer.

- `@vx-foundation/security-testing`: deterministic fuzzing, secret scanning, and supply-chain policies.

- `@vx-foundation/benchmark`: public cross-framework benchmark protocol and reports.
