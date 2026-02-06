# CLAUDE.md

## Project: Monitor Server

Self-hosted server/infrastructure monitoring dashboard. Monorepo with Bun workspaces.

### Packages

- `packages/dashboard` - Backend API server (Elysia/Bun, SQLite)
- `packages/web` - Frontend SPA (SolidJS, Vite)
- `packages/agent` - Monitoring agent (runs on target servers)
- `packages/shared` - Shared types and constants

### Dev Commands

```sh
bun install          # install deps
bun run dev          # start dashboard + web dev server
bun run build        # build frontend to packages/dashboard/public
```

### Rules

- **NEVER add glow effects (box-shadow with blur spread, CSS glow, canvas shadowBlur with bright colors, text-shadow glow, etc.).** No glowing UI elements. No `--glow` CSS variables. No `box-shadow: 0 0 Xpx <bright-color>`. No neon/luminous effects of any kind. Use solid borders, subtle background shifts, or opacity changes instead. Drop shadows for depth (using dark/black colors) are fine. Focus rings (`0 0 0 Xpx`) are fine.
- Frontend uses SolidJS, not React. Do not use React APIs.
- Styling is plain CSS with custom properties. No CSS-in-JS, no preprocessors.
