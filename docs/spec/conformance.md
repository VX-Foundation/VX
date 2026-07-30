# Conformance

A VX implementation is conforming when it:

1. parses valid normative examples;
2. rejects invalid normative examples with stable diagnostics;
3. preserves public type and package contracts;
4. emits deterministic client, server, edge, static, and library artifacts;
5. passes the official testing matrix;
6. passes repository, supply-chain, and secret policies;
7. demonstrates cleanup and leak-free execution;
8. runs the official applications using only public APIs.

The official dashboard, commerce, and collaboration applications are conformance workloads, not showcase mocks. Their public-API import gate is mandatory before a release candidate.
