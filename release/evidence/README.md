# Stable Release Evidence

This directory accepts only completed, reviewable evidence. Do not commit empty templates or fabricated records.

VX 1.0 expects:

- `external-audit.json` with auditor identity, scope, dates, findings, remediation, and public report integrity;
- `public-benchmarks.json` with exact framework versions, source revisions, environment, raw-result integrity, and reproducibility instructions;
- `production-applications.json` with the official application deployments, operating periods, incident summaries, and release versions.

The stable gate rejects missing, incomplete, or unverifiable evidence.
