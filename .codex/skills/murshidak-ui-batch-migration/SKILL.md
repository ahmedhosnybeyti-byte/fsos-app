---
name: murshidak-ui-batch-migration
description: Apply the approved Murshidak Dark Mode visual DNA consistently to multiple existing frontend screens without changing functionality.
---

# Murshidak UI Batch Migration

Use this workflow when a request applies an already approved Murshidak visual treatment to multiple existing screens. It is a visual migration workflow, not a feature, backend, or workflow-redesign skill.

## Required preparation

Before every large migration:

1. Verify the authoritative `origin/master`; do not use a backup, stale local branch, or unverified checkout.
2. Load `.codex/skills/murshidak-ui-design-system/SKILL.md` and its canonical design documentation.
3. Create a clean isolated worktree from the verified remote commit.
4. Treat the current production Team Performance screen as the canonical **Dark Mode** visual reference.

Light Mode is **PENDING VISUAL DESIGN/APPROVAL**. Do not infer or introduce a new Light Mode from the Dark Mode reference. Preserve existing Light Mode behavior unless the user explicitly requests Light Mode work.

## Screen mapping and implementation

Map every requested production route to its exact App Router page file. Inspect each page individually before editing; account for its existing header, actions, maps, charts, filters, states, and responsive layout.

Apply the approved visual pattern with existing primitives first:

- cinematic dark workspace, using `dashboard-cinematic-bg` and `dashboard-starfield` only where appropriate;
- one `glass-hero` as the primary hero surface;
- existing blue/purple Murshidak hero treatment, glass surfaces, thin bright borders, controlled static glow, shadows, Cairo typography, and canonical spacing/radius;
- `glass-card` for ordinary content surfaces;
- Arabic-first, RTL-safe logical layout utilities and controls.

Use targeted visual patches per page. Never use blind mass search/replace. Reuse existing shared primitives rather than creating a parallel design language.

## Non-negotiable scope

Preserve business logic, APIs, queries, calculations, permissions, routes, RIE/backend/data behavior, maps, charts, filters, and workflows. Do not remove information or alter functionality just for visual consistency.

Do not modify RIE or backend in a UI migration. Do not create or change shared components, tokens, or global CSS unless the request explicitly requires a shared visual primitive.

## Validation and delivery

Validate that:

- only the requested screens and explicitly authorized shared visual primitives changed;
- no functional code changed;
- typecheck and `git diff --check` pass.

Do not declare visual success based only on build/tests. Final visual acceptance belongs to the user.

Never generate local previews/screenshots or start a dev server unless explicitly requested. Never install dependencies solely to create a preview.

Commit only validated changes. Deploy through Railway/Linux and perform route health checks only when the user explicitly requests deployment.
