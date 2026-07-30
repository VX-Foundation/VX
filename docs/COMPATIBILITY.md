# Compatibility Policy

VX uses semantic versioning for every public package.

- **Patch** releases fix behavior without removing or changing public declarations.
- **Minor** releases may add packages, entrypoints, symbols, diagnostics, and optional capabilities.
- **Major** releases may remove entrypoints, change exported declarations, tighten required peer ranges, or intentionally change stable syntax/runtime behavior.

The `@vx/release` snapshot records each exported declaration from generated `.d.ts` files. A removed or changed declaration requires a major package bump; an additive declaration requires at least a minor bump. Stable and `next` releases must compare against the committed baseline. Canary builds may report compatibility advisories without blocking publication.

Compiler diagnostics can become stricter in a minor release only when they close a security, correctness, or accessibility defect and a migration path is documented. Generated output is not a public API unless an entrypoint explicitly exposes it. Internal file paths, undocumented virtual modules, and `dist` layout details outside `exports` are not compatibility guarantees.
