# External security audit process

An external audit is required before the first stable 1.0 release and after material changes to the parser, serializer, HTTP server, plugin sandbox, package signing, or release pipeline.

The audit scope must include architecture, threat model, source review, fuzzing results, dependency inventory, sandbox escape testing, SSR and hydration injection testing, request smuggling and body-limit testing, signature verification, provenance, and CI permissions.

Findings are tracked privately with severity, affected versions, owner, target date, fix commit, regression test, disclosure decision, and advisory identifier. A release cannot claim the audit gate while critical or high findings remain unresolved without a documented risk acceptance signed by project security owners.
