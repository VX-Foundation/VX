# VX Threat Model

## Assets

VX protects application sessions, server-only data, action authorization, request-scoped stores, generated HTML, hydration state, package consumers, and the integrity of published framework artifacts.

## Trust boundaries

The main boundaries are VX source to compiler IR, server to browser serialization, browser to server actions, route input to endpoint code, package build to registry, and extension/tooling input to the local workspace.

## Threats and controls

| Threat | Default control |
| --- | --- |
| Script injection through text or state | Escaped DOM text, versioned serialization, script-safe escaping |
| Executable URLs | Scheme-aware URL sanitizer in client and SSR |
| Prototype pollution | Forbidden keys, null-prototype decoded records, bounded traversal |
| CSRF and cross-origin action calls | Origin validation, HMAC token bound to a session, authenticated-by-default actions |
| Resource exhaustion | Body, string, depth, node, parameter, graph, and route limits |
| Request data leakage | Per-request runtime, private-cache rules, deterministic cleanup |
| Clickjacking and capability abuse | CSP, frame denial, Permissions Policy, COOP and CORP |
| Supply-chain substitution | Fixed registry, no install scripts, files allowlist, tarball inspection, provenance |
| Accidental breaking release | Public API snapshots and semver impact gate |
| Parser/compiler crash input | Deterministic mutation fuzzing and span invariants |

## Residual risks

Application code can still introduce unsafe HTML, weak authorization callbacks, broad CSP overrides, secrets in public state, or vulnerable third-party dependencies. Browser conformance and dependency review therefore remain mandatory CI gates. Native adapters must reproduce the same request-isolation and header contracts before being declared supported.
