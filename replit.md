# FSOS Platform

A clean React + TypeScript + Vite frontend foundation with no backend, auth, or AI — ready for features to be added.

## Run & Operate

- `pnpm --filter @workspace/fsos-platform run dev` — run the frontend dev server (port 23223)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite 7
- Styling: Tailwind CSS v4 + shadcn/ui component library
- Routing: Wouter
- Build: Vite

## Where things live

- `artifacts/fsos-platform/src/pages/` — route-level page components
- `artifacts/fsos-platform/src/layouts/` — layout wrappers (MainLayout)
- `artifacts/fsos-platform/src/components/ui/` — shadcn/ui primitives
- `artifacts/fsos-platform/src/hooks/` — custom React hooks
- `artifacts/fsos-platform/src/types/index.ts` — shared TypeScript types
- `artifacts/fsos-platform/src/lib/constants.ts` — app-wide constants
- `artifacts/fsos-platform/src/index.css` — global styles & design token theme

## Architecture decisions

- Frontend-only: no API, no database, no auth — clean slate for future features.
- Wouter for routing (lightweight, ~2kb, no react-router dependency).
- Tailwind v4 with CSS custom properties for the color system (light + dark mode ready).
- shadcn/ui gives a full component library without bundling unused components.
- `@workspace/api-client-react` intentionally excluded — add back when a backend is needed.

## Product

FSOS Platform frontend: header nav, home page, about page, 404 page, light/dark-mode-ready design system.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Restart workflow name is `artifacts/fsos-platform: web` (not just "web" or "FSOS Platform").
- `BASE_PATH` and `PORT` are injected by the artifact workflow — do not hardcode them.
- Theme colors are all CSS custom properties in `index.css`; edit there, not in Tailwind config.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
