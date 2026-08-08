# VX Documentation Portal

`apps/docs` is the official source-driven documentation application for VX 0.2.0.
It is not a marketing placeholder: it is a statically generated VX application that
publishes the learning path, production guides, complete reference, cookbook,
tutorials, framework internals, security documents, migration guidance, and project
policies.

## Coverage

The portal currently indexes more than 400 routes, including:

- one contract page for each of the 43 native widgets;
- one reference page for each of the 167 Visual IR properties;
- one reference page for each of the 52 built-in visual roles;
- all supported visual interaction and environment conditions;
- all public VX package APIs and subpath exports;
- the frozen language specification;
- framework, server, data, forms, rendering, testing, and tooling documentation;
- accessibility, performance, security, deployment, package, and plugin guides;
- cookbook recipes, tutorials, migration documents, and release policies.

## Source ownership

The portal does not maintain independent copies of framework contracts:

- widget pages come from `packages/widgets/registry/widgets.mjs` and generated `.vx`
  contracts;
- visual pages come from the compiler property, role, and condition registries;
- package pages come from package manifests and `docs/api` output;
- specification, guides, cookbook, tutorials, internals, security, migrations, and
  policies come from the canonical Markdown documents under `docs`.

This prevents the web portal from becoming another source of truth.

## Commands

```bash
pnpm --filter @vx-foundation/docs docs:generate
pnpm --filter @vx-foundation/docs docs:check
pnpm --filter @vx-foundation/docs dev
pnpm --filter @vx-foundation/docs check
pnpm --filter @vx-foundation/docs build
```

From the repository root:

```bash
pnpm docs:portal:generate
pnpm docs:portal:check
pnpm verify:documentation
```

`docs:check` regenerates the portal, rejects stale artifacts, validates every route and
internal link, verifies exact widget/property/role coverage, and enforces the project
1,000-line policy.

## Editing workflow

1. Edit the owning compiler, widget, package, or canonical Markdown source.
2. Run `pnpm docs:api` when public package exports changed.
3. Run `pnpm docs:portal:generate`.
4. Run `pnpm docs:portal:check`.
5. Run the normal VX parser, typecheck, test, and build gates.

Do not hand-edit generated widget, visual, package, specification, guide, cookbook,
tutorial, internal, security, migration, or policy routes. Update their source contract
and regenerate the portal instead.
