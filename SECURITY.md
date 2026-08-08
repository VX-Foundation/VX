# VX Security Policy

## Supported releases

Security fixes are provided for the latest stable minor release and the currently published `next` line. Canary builds are evaluation artifacts and carry no support guarantee.

## Reporting a vulnerability

Do not open a public issue containing exploit details. Use GitHub Private Vulnerability Reporting at https://github.com/VX-Foundation/vx/security/advisories/new. Include the affected package and version, a minimal reproduction, expected impact, and any known mitigation. The canonical repository and private reporting destination are configured; stable publication still requires independent audit evidence and all readiness gates.

## Security invariants

VX treats source files, route inputs, serialized state, server-action bodies, package archives, and generated HTML as untrusted. The default platform:

- escapes text and serialized state;
- rejects executable URL schemes;
- requires explicit action authorization and CSRF policy;
- limits action payload size, nesting, node count, and parameter count;
- isolates request state and disposes it deterministically;
- emits restrictive security headers and per-request CSP nonces;
- forbids package install lifecycle scripts;
- requires provenance, publication-manifest verification, and compatibility checks for stable releases;
- isolates plugins in Workers with bounded resources and mediated I/O;
- binds signed plugin identities to executable source integrity through detached `vx.plugin.json` manifests;
- blocks plugin reads of environment files, credentials, private keys, VCS internals, and dependency trees.

Unsafe exceptions must be explicit, narrowly scoped, documented, and covered by a security test.

## Coordinated disclosure timeline

The security team acknowledges a complete report within three business days, provides an initial severity assessment within seven business days, and targets a fix or mitigation plan within ninety days. Critical active exploitation is handled on an emergency timeline. Dates may change when coordination with other vendors is required, but reporters receive status updates.

## Advisories and external audits

Confirmed issues follow the private advisory process in `docs/security/ADVISORIES.md`. External audits follow `docs/security/EXTERNAL-AUDIT.md`; an audit is not described as complete until its scope, date, auditor identity, unresolved findings, and remediation status are published.
