# VX threat model

## Assets

VX protects source code, package metadata, lockfiles, signing keys, plugin code, build outputs, server credentials, user sessions, request data, serialized state, generated HTML, caches, source maps, and release provenance.

## Trust boundaries

- application source to parser and compiler;
- compiler output to browser runtime;
- request bytes to server body parsing and routing;
- server state to serialization and hydration;
- project filesystem to plugins and tooling;
- registry packages to package installation and build;
- CI workers to release signing and publication;
- browser extensions and third-party scripts to hydration recovery.

## Adversaries

The model includes malicious request senders, compromised dependencies, malicious or compromised plugins, poisoned caches, hostile project files, compromised CI credentials, malicious browser extensions, accidental secret publication, and maintainers making unsafe configuration changes.

## Required controls

Inputs are bounded before deep processing. Parsers return diagnostics instead of process crashes. Serialization rejects executable or prototype-mutating structures. HTTP bodies enforce byte, field, depth, and node limits. Plugins run in bounded Workers with mediated I/O and signed source identity. Install lifecycle scripts are denied by default. Releases require clean provenance and verified publication manifests. Security tests cover every unsafe exception.

## Out of scope

The framework cannot protect applications that deliberately expose secrets to client code, disable authorization, run arbitrary untrusted native code, or deploy on a compromised host. VX must diagnose unsafe configuration but cannot make those environments trustworthy.
