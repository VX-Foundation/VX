# Diagnostics

Every diagnostic has a stable code, severity, message, source span when available, and a suggested correction when one can be stated safely.

## Requirements

- Parse errors MUST recover sufficiently to report independent nearby errors.
- Type errors MUST identify expected and actual types.
- Boundary errors MUST identify the client, server, worker, package, or plugin edge.
- Hydration mismatches MUST classify the mismatched node or value.
- Accessibility diagnostics SHOULD include a concrete correction.
- Security diagnostics MUST avoid printing secret values.
- Tooling MUST support cancellation and incremental replacement of stale diagnostics.

Diagnostic codes are compatibility surface. Renaming or reinterpreting a public code requires migration metadata.
