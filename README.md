<p align="center">
  <img src="vx.svg" alt="VX Logo" width="280" />
</p>

# VX

VX is a compiler-first, full-stack web framework focused on deterministic execution, direct DOM updates, typed data flows, production SSR, accessibility, secure server boundaries, and portable deployment adapters.

> **Current release line:** `0.1.2` unstable. Publish evaluation builds under `canary` and release candidates under `next`. The `latest` tag is reserved for VX 1.0 after every stabilization criterion is independently satisfied.

> **npm namespace change:** Public packages moved from the legacy `@vx/*` namespace to the VX Foundation-owned `@vx-foundation/*` namespace before the first public release. New code and documentation must use only `@vx-foundation/*` imports.

## Highlights

- `.vx` language with compiler-owned diagnostics and source mapping
- fine-grained direct DOM rendering without a Virtual DOM
- deterministic SSR, streaming, hydration recovery, islands, and resumable boundaries
- typed forms, queries, mutations, offline queues, realtime, and optimistic updates
- file-system routing, endpoints, sessions, middleware, security headers, and observability
- browser, server, edge, static, library, and serverless build targets
- official Node, Docker, Static, Cloudflare, Vercel, Netlify, AWS Lambda, Bun, Deno, and generic adapters
- typed design systems, scoped styling, accessibility diagnostics, and runtime audits
- CLI, Language Server, VS Code tooling, Browser DevTools, packages, signed plugins, testing, fuzzing, and benchmark protocols

## Requirements

- Node.js 22 LTS or 24 LTS
- pnpm 11.19.0 through Corepack

## Create a project

After the first `next` release is published:

```bash
corepack enable
pnpm create @vx-foundation/vx@next my-app
cd my-app
pnpm install
pnpm dev
```

Available templates: `basic`, `starter`, `fullstack`, and `library`.

## Repository development

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:release-candidate
```

## Release status

VX 0.1 is prepared for GitHub and npm publication, but VX 1.0 remains intentionally blocked until external audit evidence, native public benchmarks, production application evidence, and the required canary/next stabilization period are complete. See [`docs/VX-1.0-READINESS.md`](docs/VX-1.0-READINESS.md).

## Documentation

- [Language specification](docs/spec/README.md)
- [Framework guide](docs/framework/README.md)
- [API reference](docs/api/README.md)
- [Tutorials](docs/tutorials/README.md)
- [Cookbook](docs/cookbook/README.md)
- [Deployment](docs/guides/deployment.md)
- [Security](SECURITY.md)
- [Publishing and npm bootstrap](docs/PUBLISHING.md)
- [Git and GitHub bootstrap](docs/GIT-PUBLISHING.md)
- [Contributing](CONTRIBUTING.md)
- [RFC process](rfcs/README.md)

## License

MIT © 2026 Veelv
