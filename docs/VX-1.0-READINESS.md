# VX 1.0 Readiness

VX 1.0 is promoted only by evidence. A maintainer statement, successful local build, or completed implementation phase cannot bypass the stable-release gate.

## Completed stabilization foundations

- language specification freeze manifest;
- public API baseline and freeze digest;
- package metadata, license, repository identity, and npm publishing policy;
- no symbolic Tailwind or MDX plugins;
- real sitemap plugin and isolated plugin host;
- documentation, migration guides, RFC process, maintenance policy, and support policy;
- official dashboard, commerce, and collaboration conformance applications;
- CI definitions for Windows, Linux, macOS, Node 22/24, Chromium, Firefox, and WebKit;
- clean-room package and project creation gates;
- SemVer compatibility, provenance, security, fuzzing, adapters, and benchmark protocols.

## Remaining stable blockers

The following evidence cannot be fabricated or replaced by local simulation:

1. A green protected-branch CI history on every supported operating system and runtime.
2. An independent external security audit with findings and remediation status.
3. Native, reproducible public benchmark results for the declared framework matrix.
4. The three official applications deployed and operated in production with evidence.
5. Canary and next releases used for the minimum stabilization duration in `release/stabilization-policy.json`.

Until these conditions are complete, releases use `canary` or `next`; `latest` remains blocked.
