# Security Guide

Start with a threat model. Treat every request, form, upload, plugin, package, environment value, and browser message as untrusted.

Use server-owned authorization, signed opaque sessions, CSRF protection, strict CSP, bounded parsers, rate limits, safe errors, integrity-locked dependencies, signed plugins, secret scanning, CodeQL, fuzzing, and coordinated disclosure.

Never rely on hidden controls, client roles, route visibility, or TypeScript types as security boundaries.
