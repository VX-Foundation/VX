# VX Engineering Standards

Status: **mandatory repository policy**

These rules apply to source code, tests, examples, diagnostics, comments, documentation, configuration, and generated source committed to the VX repository.

## 1. Project language

English is the only project language.

This includes:

- identifiers and public APIs;
- source comments;
- diagnostics and internal messages;
- tests and fixtures;
- examples and templates;
- documentation and architecture records;
- commit-facing scripts and CI output.

Localized product content belongs in explicit localization fixtures or application-level translation resources. It must not appear as the default language of framework source or documentation.

The repository policy scanner checks committed text for disallowed language markers. CI fails when a violation is found.

## 2. File-size limits

An authored file must never exceed 1000 lines.

The limit is a failure boundary, not a design target. Files should normally remain within these ranges:

| File role | Preferred range |
|---|---:|
| focused utility or value object | 40–200 lines |
| parser or compiler domain module | 100–400 lines |
| orchestration module | 50–250 lines |
| normative specification | 100–500 lines |
| test file | 80–400 lines |

A file at 700 lines enters mandatory review. Reviewers must decide whether the file still owns one coherent responsibility or should be split before additional work is accepted.

Package-manager lockfiles are generated dependency graphs and cannot be split into modules. They are the only current line-limit exception. Generated source remains subject to the 1000-line limit and must be sharded by its generator when necessary.

## 3. Responsibility boundaries

Every module must have one primary reason to change.

Examples:

- scanners read characters and produce lexical facts;
- parsers build syntax nodes;
- analyzers resolve symbols and validate semantics;
- IR builders convert validated syntax into target-neutral programs;
- emitters translate IR into target output;
- runtime modules execute only behavior that cannot be removed at build time;
- orchestrators sequence domain services but do not contain domain algorithms.

A module must not combine unrelated concerns merely because they are used by the same phase.

## 4. Orchestration rules

Orchestration must be explicit and shallow.

An orchestrator may:

- establish execution order;
- create and pass typed contexts;
- collect diagnostics and results;
- select an implementation through a defined interface;
- coordinate cleanup and failure propagation.

An orchestrator must not:

- contain parser rules;
- implement type inference;
- generate target code directly;
- mutate hidden global state;
- duplicate validation owned by another layer;
- swallow failures and continue with placeholder behavior.

## 5. Module contracts

Cross-package communication uses exported contracts from the owning package.

Rules:

- package internals must not be imported through private paths;
- target-specific types must not leak into target-neutral layers;
- public contracts must not depend on implementation classes;
- ownership and cleanup must be visible in the contract;
- optional behavior must be modeled explicitly rather than inferred from missing values;
- circular package dependencies are forbidden.

## 6. Index modules and registries

An `index.ts` file should normally be a public export surface. It must not become a catch-all implementation module.

Generated registries are allowed when they are reproducible and verified. If a generated registry approaches the line limit, the generator must emit multiple deterministic shards and a small top-level index.

## 7. Tests follow ownership

Tests should be colocated with the responsibility they verify.

- parser tests verify syntax and spans;
- analyzer tests verify semantic rules and diagnostics;
- IR tests verify target-neutral representation;
- emitter tests verify generated output;
- runtime tests verify lifecycle and direct updates;
- integration tests verify package boundaries;
- policy tests verify repository constraints.

A large end-to-end test does not replace focused tests for each layer.

## 8. Automated enforcement

Run:

```bash
pnpm verify:policy
```

The command validates:

- English-only project language markers;
- the 1000-line hard limit for authored files;
- the review threshold for files approaching the limit;
- explicit reporting of generated-file exceptions.

The same check runs in CI before dependency installation, so policy violations fail quickly and do not consume the full build pipeline.
