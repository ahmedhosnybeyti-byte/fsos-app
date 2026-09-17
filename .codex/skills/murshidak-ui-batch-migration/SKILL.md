---
name: murshidak-ui-batch-migration
description: Apply approved Murshidak Dark or Light Mode visual DNA consistently to multiple existing frontend screens without changing functionality.
---

# Murshidak UI Batch Migration

Use this workflow when a request applies an already approved Murshidak visual treatment to multiple existing screens. It is a visual migration workflow, not a feature, backend, or workflow-redesign skill.

## Required preparation

Before every large migration:

1. Verify the authoritative `origin/master`; do not use a backup, stale local branch, or unverified checkout.
2. Load `.codex/skills/murshidak-ui-design-system/SKILL.md` and its canonical design documentation.
3. Create a clean isolated worktree from the verified remote commit.
4. Treat the current production Team Performance screen as the canonical **Dark Mode** visual reference. Treat the approved Team Performance Light Mode reference image as the canonical **Light Mode** visual reference.

For Light Mode work, use the shared `AppShell` workspace treatment first: `murshidak-light-workspace` gives every authenticated dashboard route the approved pale-blue/lavender atmosphere and illuminated glass primitives. New dashboard pages inherit it automatically when they use existing `glass-card`/`glass-surface` and, where justified, a single `glass-hero`. Do not infer a new Light Mode language.

## Screen mapping and implementation

Map every requested production route to its exact App Router page file. Inspect each page individually before editing; account for its existing header, actions, maps, charts, filters, states, and responsive layout.

Apply the approved visual pattern with existing primitives first. Choose the requested canonical mode:

- cinematic dark workspace, using `dashboard-cinematic-bg` and `dashboard-starfield` only where appropriate;
- one `glass-hero` as the primary hero surface;
- existing blue/purple Murshidak hero treatment, glass surfaces, thin bright borders, controlled static glow, shadows, Cairo typography, and canonical spacing/radius;
- `glass-card` for ordinary content surfaces;
- Arabic-first, RTL-safe logical layout utilities and controls.

For Light Mode, retain the shared cool light-gray/pale-blue canvas, subtle blue/lavender atmosphere, softly tinted and reflective glass surfaces, refined borders/shadows, dark navy text, Murshidak blue primary accent, and controlled purple secondary accent. Do not change Dark Mode while migrating Light Mode, or vice versa.

Inspect each page and use targeted visual patches for any bespoke composition that does not use the shared primitives. Never use blind mass search/replace. Reuse existing shared primitives rather than creating a parallel design language.

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
