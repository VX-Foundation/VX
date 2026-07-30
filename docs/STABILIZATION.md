# Stabilization Process

## Release stages

### Canary

Canary releases validate packaging, installation, generated projects, adapters, and early user feedback. They may include incompatible experiments and do not carry support guarantees.

### Next

Next releases are release candidates. Public API compatibility is mandatory, migration metadata must be complete, and all automated framework gates must pass. The stabilization log records publish date, version, source revision, incidents, and adoption evidence.

### Stable

Stable promotion requires every criterion in `release/v1-readiness.json`, the minimum periods in `release/stabilization-policy.json`, and repository evidence for audit, benchmarks, production applications, and clean CI.

## Freeze rules

During next stabilization:

- language and public API changes require an RFC;
- breaking changes reset the next stabilization clock unless they only remove an unpublished defect;
- new public APIs require real application adoption and migration analysis;
- unresolved severity-high security findings block all releases;
- regressions require a test before the fix is accepted.
