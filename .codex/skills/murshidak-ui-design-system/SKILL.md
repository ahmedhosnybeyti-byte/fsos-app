---
name: murshidak-ui-design-system
description: Apply Murshidak's verified production visual system when creating or substantially redesigning frontend screens; not for backend-only work or minor non-visual fixes.
---

# Murshidak UI Design System

Before creating or substantially redesigning a Murshidak frontend screen, read [the canonical design system](../../../docs/design/MURSHIDAK_UI_DESIGN_SYSTEM.md).

Treat that document and the components it cites as the source of truth. Reuse shared UI components and tokens where they fit instead of copying a visual approximation.

## Approved visual-reference status

- The current production Team Performance screen is the canonical **Dark Mode** visual reference for Murshidak screen migrations.
- The approved Team Performance Light Mode reference image is the canonical **Light Mode** visual reference. Use a cool light-gray/pale-blue canvas, subtle blue/lavender atmosphere, softly tinted glass surfaces, refined borders/shadows, dark navy text, primary blue, controlled secondary purple, Cairo, and RTL-safe spacing.
- For multi-screen visual migrations, use `.codex/skills/murshidak-ui-batch-migration/SKILL.md` after loading this design-system skill.

## Required decisions

- Preserve the blue primary/secondary semantic palette, glass treatment, thin bright edges, semantic static glow, radius, typography, spacing, and visual density already in production.
- Keep the app Arabic-first and RTL-correct: retain logical spacing/alignment utilities and verify both Arabic RTL and English LTR.
- Use `glass-card` for ordinary surfaced content and reserve `glass-hero` (aurora/reflection/strong treatment) for one primary element only when the screen has one.
- Preserve the existing interaction language: shared buttons/inputs/selects/dialogs, visible keyboard focus, selected/hover states, disabled states, compact errors, skeleton content loading, and responsive density.
- Do not introduce a new palette, typography system, icon library, animation style, visual treatment, or independent component variant without explicit user approval.

## Completion check

Before declaring a frontend visual task complete, compare the result with the canonical guide and a representative dashboard screen. Check light/dark, RTL/LTR, desktop/mobile breakpoints, loading/empty/error states when present, and focus/selected/hover behavior. Report any intentional exception and its approval.
