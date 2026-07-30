# Project Structure

A conventional application uses `src/pages` for routes, `src/components` for reusable visual components, `src/modules` for headless VX modules, and `src/server` for server-only TypeScript.

`vx.config.ts` is the only required framework configuration point. Generated build state belongs to `.vx`; deployable output belongs to `dist`. Neither directory is source.
