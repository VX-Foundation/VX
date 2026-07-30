# VX Official Dashboard

The dashboard is a first-party conformance application for authenticated, permission-aware, server-rendered operational software. It uses only public VX package exports and remains private so it can evolve with the framework until VX 1.0.

## Workloads validated

- authentication with signed opaque sessions;
- role and permission policies for admin, analyst, and viewer principals;
- nested layouts and routed pages;
- accessible data tables and filter controls;
- chart-oriented canvas output;
- server-rendered metrics;
- managed queries and mutation actions;
- typed reports and settings forms;
- bounded API endpoints and security headers.

## Environment

Copy `.env.example` to a local secret source and replace the placeholder with at least 32 random bytes. Never commit the resulting secret.

## Commands

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm preview
```

The application is verified by `pnpm verify:official-apps` and by the release clean-room workflow.
