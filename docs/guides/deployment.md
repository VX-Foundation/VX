# Deployment Guide

Choose an official adapter: Node standalone, Docker, Static, Cloudflare Workers, Cloudflare Pages, Vercel, Netlify, AWS Lambda, generic serverless, Bun, Deno, or generic edge.

Run the release-candidate gate, frozen installation, tests, production build, artifact integrity, preview smoke test, and provider-specific health checks. Supply secrets through the provider secret manager, never through committed `.env` files.
