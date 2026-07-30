# VX public benchmark methodology

The public suite compares VX, React, Next.js, Svelte, SvelteKit, Solid, Vue, and Nuxt through framework-specific adapters implementing one protocol.

## Fairness rules

- All frameworks run on the same host, operating system image, Node version, browser build, CPU governor, locale, time zone, viewport, and network policy.
- Production builds are used unless the scenario is explicitly cold build, incremental build, or HMR.
- Exact versions and lockfile integrity are captured before execution.
- Warmups are separated from measured iterations.
- Raw samples are retained; medians and p95 values are derived, never substituted for raw data.
- Framework-specific optimizations are allowed only when they represent documented production guidance and preserve scenario behavior.
- A scenario is invalid if rendered output, event behavior, data volume, accessibility semantics, or server payload differs.
- Results from dirty worktrees, thermal throttling, background load, or different suite versions are not rankable.

## Scenarios

Lists create and update large keyed collections. Reordering moves existing identities. Forms validate and update controlled fields. Dashboards combine many components and derived values. SSR measures complete deterministic markup. Streaming measures first byte and completion. Hydration measures readiness after server markup. Islands hydrate only declared interactive boundaries. Build scenarios measure clean and incremental work. HMR measures source edit to visible update. Memory records retained heap after disposal. Bundle size records compressed production assets.


## Native-fixture gate

The runner refuses common synthetic implementations. Every fixture must import the actual framework runtime, retain per-iteration evidence, run from an exact lockfile and identify a clean source commit. Missing native source, evidence, browser identity, raw samples or integrity data is a hard failure. The repository does not publish rankings until all selected frameworks pass the same scenario-conformance checks.

Scheduled CI validates the protocol and internal quality budgets. Cross-framework execution is manually dispatched only after framework-native fixtures and their pinned browser/container image are available. This prevents an incomplete fixture from producing a public comparison.
