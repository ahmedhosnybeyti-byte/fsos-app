---
name: murshidak-ui-design-system
description: Apply Murshidak's existing design system and localization whenever creating or modifying UI, including minor text/style changes; not for backend-only work.
---

# Murshidak UI Design System

Before creating or modifying Murshidak UI, including minor text/style changes, read [the canonical design system](../../../docs/design/MURSHIDAK_UI_DESIGN_SYSTEM.md).

Treat that document and the components it cites as the source of truth. Reuse shared UI components and tokens where they fit instead of copying a visual approximation.

## Approved visual-reference status

- The current production Team Performance screen is the canonical **Dark Mode** visual reference for Murshidak screen migrations.
- The approved Team Performance Light Mode reference image is the canonical **Light Mode** visual reference. Use a cool light-gray/pale-blue canvas, subtle blue/lavender atmosphere, softly tinted glass surfaces, refined borders/shadows, dark navy text, primary blue, controlled secondary purple, Cairo, and RTL-safe spacing.
- Every authenticated dashboard route inherits the approved Light Mode workspace from `AppShell` (`murshidak-light-workspace`). New dashboard pages must use the existing `glass-card`/`glass-surface` and, when warranted, one `glass-hero`, rather than adding opaque local panel formulas. This shared treatment is Light Mode only; Dark Mode keeps its canonical production treatment.
- For multi-screen visual migrations, use `.codex/skills/murshidak-ui-batch-migration/SKILL.md` after loading this design-system skill.

## Required decisions

- Preserve the blue primary/secondary semantic palette, glass treatment, thin bright edges, semantic static glow, radius, typography, spacing, and visual density already in production.
- Keep the app Arabic-first and RTL-correct: retain logical spacing/alignment utilities and verify both Arabic RTL and English LTR.
- Use the existing `TranslationProvider` / `useTranslation` and keys in `apps/web/src/lib/i18n/dictionaries.ts` for all UI copy, states, validation and accessibility labels; add both Arabic and English entries together. Do not introduce local bilingual selectors, hard-coded single-language copy or a parallel i18n system.
- Retain `ThemeProvider` and the shared semantic tokens in `apps/web/src/app/globals.css` / `apps/web/tailwind.config.ts` for Light/Dark support; do not add independent theme state, local palettes or arbitrary colors/CSS.
- Use `glass-card` for ordinary surfaced content and reserve `glass-hero` (aurora/reflection/strong treatment) for one primary element only when the screen has one.
- Preserve the existing interaction language: shared buttons/inputs/selects/dialogs, visible keyboard focus, selected/hover states, disabled states, compact errors, skeleton content loading, and responsive density.
- Do not introduce a new palette, typography system, icon library, animation style, visual treatment, or independent component variant without explicit user approval.

## Completion check

Before declaring a frontend visual task complete, compare the result with the canonical guide and a representative dashboard screen. Check light/dark, RTL/LTR, desktop/mobile breakpoints, loading/empty/error states when present, and focus/selected/hover behavior. Report any intentional exception and its approval.

Visual corrections must preserve business logic, inventory/accounting behavior and database access. Validate only affected interfaces unless functional work is separately authorized; report whether verification was in source or in a rendered UI.
