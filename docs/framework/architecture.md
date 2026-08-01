# Framework Architecture

VX is a compiler-first web application platform. A `.vx` source module is analyzed into explicit semantic, reactive, data, view, visual, and boundary representations before target code is emitted.

## Compilation pipeline

```text
.vx source
  → lexical and syntax analysis
  → symbols, scopes, and types
  → reactive and data dependency graphs
  → View IR and Visual IR
  → client/server boundary analysis
  → DOM, SSR, server, and package lowering
  → bundling, manifests, and deployment adapters
```

The compiler owns the relationship between `#script` and `#view`. Runtime code is emitted only for behavior that cannot be completed statically or during server rendering.

## Package responsibilities

- `@vx-foundation/language` owns parsing, source locations, recovery, and formatting-compatible syntax data.
- `@vx-foundation/compiler` owns semantic analysis, accessibility checks, dependency graphs, target lowering, and source maps.
- `@vx-foundation/runtime` owns fine-grained reactivity, scheduling, DOM operations, hydration, transitions, ownership, and cleanup.
- `@vx-foundation/router` owns the application graph, route matching, navigation, metadata, loaders, and route lifecycles.
- `@vx-foundation/server` owns request context, sessions, middleware, endpoint contracts, security boundaries, and server integration.
- `@vx-foundation/bundler` owns build targets, assets, manifests, chunks, integrity, and deployment adapters.
- `@vx-foundation/tooling`, `@vx-foundation/language-server`, and the official extensions own diagnostics, inspection, editing, and debugging workflows.

## Intermediate representations

VX uses explicit IR layers so validation and optimization happen before code generation:

- Semantic IR for resolved declarations, contracts, scopes, and types.
- Reactive IR for state, derives, effects, queries, actions, and bindings.
- Data Program IR for cache, mutation, persistence, realtime, and lifetime policies.
- View IR for interface structure, conditions, keyed collections, events, and content regions.
- Visual IR for roles, tokens, layout intent, responsive behavior, states, motion, and accessibility semantics.
- Boundary IR for static, client, server, request-scoped, and serializable values.

## Execution ownership

Every resource has an explicit owner. Component, route, request, query, effect, plugin, and server lifecycles must provide deterministic cleanup. Cancellation is propagated through `AbortSignal`, and stale work must not commit results after ownership has ended.

## Public boundaries

Applications and official examples use only package entries declared through `exports`. Internal source paths, generated implementation paths, and private modules are not public contracts.

The normative language contract is maintained in [`../spec`](../spec/README.md). Public package surfaces are documented in [`../api`](../api/README.md).
