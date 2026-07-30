# VX Project

VX is a compiler-first web application framework with its own `.vx` language. It integrates components, fine-grained reactivity, data operations, routing, rendering, server execution, styling intent, accessibility, tooling, testing, packaging, and deployment through one compiler-owned model.

## Mission

Make complete web applications easier to understand and maintain by moving coordination from runtime conventions into explicit language and framework contracts.

## Core values

- clarity before cleverness;
- explicit responsibilities;
- compiler-enforced correctness;
- predictable ownership and cleanup;
- minimal necessary runtime;
- accessibility and security by design;
- reusable public contracts;
- reproducible builds and honest release gates.

## Source model

```text
#script  props, constants, state, derives, queries, actions, effects, stores
#view    widget tree, control flow, events, semantic roles, structural roles
```

The normative syntax and semantics are frozen under `docs/spec`. Changes to the language, public APIs, package format, or security boundaries require the RFC and migration process.

## Documentation map

- `docs/spec/README.md` — normative language and framework source specification.
- `docs/framework/README.md` — framework usage and operational behavior.
- `docs/framework/architecture.md` — compiler, runtime, server, and package boundaries.
- `docs/api/README.md` — public package exports.
- `docs/guides/` — security, deployment, performance, accessibility, package, and plugin guides.
- `docs/tutorials/` and `docs/cookbook/` — practical application development.
- `docs/migrations/` — migration contracts for published changes.

## Completion rule

A feature is complete only when source syntax, semantic validation, runtime behavior, public packaging, documentation, tests, and a real application path agree.
