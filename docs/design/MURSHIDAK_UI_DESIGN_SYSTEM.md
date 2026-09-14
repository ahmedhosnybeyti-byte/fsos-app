# Murshidak UI Design System

Canonical record of the production frontend visual language, audited from `origin/master` at `47d04e9` (2026-09-14). It describes the app; it is not a redesign brief.

## Authority and use

Use the shared primitives before writing one-off styling: `Card`, `Button`, `Input`, `Select`, `Dialog`, `Badge`, the shell, and the utility classes in `globals.css`. The dashboard home screen is the clearest completed reference for hierarchy and density.

## Approved visual-reference status

- **Dark Mode:** the current production Team Performance screen is the canonical visual reference for Murshidak screen migrations.
- **Light Mode:** **PENDING VISUAL DESIGN/APPROVAL**. Preserve current Light Mode behavior; do not infer or introduce a new Light Mode design from the approved Dark Mode reference unless explicitly requested.
- **Multi-screen migrations:** use `.codex/skills/murshidak-ui-batch-migration/SKILL.md` as the standard workflow, together with this design system.

**Explicit tokens** are defined in `apps/web/src/app/globals.css:6-104` and exposed to Tailwind in `apps/web/tailwind.config.ts:13-70`. Values below are HSL triplets and are consumed as `hsl(var(--token))`.

## Palette and surfaces (explicit)

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `--background: 210 40% 98%` | `222 47% 7%` |
| Main text | `--foreground: 222 47% 11%` | `210 20% 96%` |
| Card/popover | `--card` / `--popover: 0 0% 100%` | `222 40% 10%` |
| Brand primary and accent | `217 91% 60%` | same |
| Secondary/muted | `210 40% 94%` | `222 30% 15%` |
| Muted text | `215 16% 47%` | `215 15% 65%` |
| Border/input | `214 32% 88%` | `222 25% 20%` |
| Semantic: destructive | `0 72% 51%` | `0 63% 42%` |
| Semantic: success | `142 71% 40%` | `142 71% 45%` |
| Semantic: warning | `38 92% 45%` | `38 92% 50%` |
| AI | `262 83% 58%` | `262 83% 66%` |
| Premium | `38 30% 45%` | `43 74% 49%` |

`--accent` intentionally equals the primary blue. The page canvas is `bg-app-gradient`: `sky-50 → white → blue-50`; its dark equivalent is `#0b1220 → #0d1526 → #0a1120` (`globals.css:133-135`). Module identity is limited to low-emphasis 15%-opacity icon badges from `apps/web/src/lib/module-colors.ts:25-47`; it does not replace the blue brand/action color.

## Glass, edges, shadows, and glow (explicit)

- **Standard card/surface:** `.glass-card` / `.glass-surface` = `rounded-2xl`, `border-border/60`, `bg-card/80`, `backdrop-blur-lg`; light shadow is `inset 0 1px 0 rgb(255 255 255 / .4), 0 2px 6px rgb(0 0 0 / .03), 0 12px 32px rgb(0 0 0 / .05)`. Dark is `border-white/[.08]`, `bg-white/[.045]`, inset `.07`, then `0 2px 8px rgb(0 0 0 / .25), 0 16px 40px rgb(0 0 0 / .35)` (`globals.css:126-131`).
- **Shell panel:** `.glass-panel` = `bg-white/70 backdrop-blur-xl`, dark `bg-white/[.04]` (`globals.css:119-121`).
- **One primary hero only:** `.glass-hero` = `rounded-3xl`, `border-border/60`, `from-card/95 via-card/90 to-card/75`, `backdrop-blur-2xl`, reflection overlay, and three-part shadow: inset `.5`, `0 24px 70px -10px rgb(0 0 0 / .12)`, `0 40px 100px -20px hsl(primary / .2)`; dark values are defined beside it (`globals.css:143-175`). Do not use it for ordinary cards.
- **Glow is semantic and static:** apply at most one `glow-*` class. Normal glow is a 1px inset ring, `.07` fill, and `0 0 24–28px -8px` semantic shadow. `glow-ai-strong` is reserved for the single leading AI surface: 2px `.5` ring, `.1` fill, and `0 0 60px -12px` (70px dark) (`globals.css:245-287`). No pulse/loop.
- **Interactive card:** `card-lift` raises 2px on hover, restores/scales `.995` on press, and brightens only the border; reduced motion removes it (`globals.css:337-376`).

## Shape, spacing, and layout

**Explicit base radius:** `--radius: .875rem`; Tailwind `lg=.875rem`, `md=.75rem`, `sm=.625rem` (`globals.css:46`, `tailwind.config.ts:59-63`). Use `rounded-2xl` for glass cards, `rounded-3xl` for the hero, `rounded-md` for controls, `rounded-full` for pills, selected nav, avatars, and progress.

**Inferred dominant rhythm:** dashboard cards use `p-4`, `p-5`, or `p-6`; section gaps are `gap-3`, `gap-4`, or `gap-6`; heading-to-subtitle is commonly `mt-1`; card internals commonly use `mt-4`/`mt-5`. Responsive grid progression is one column, then `sm:grid-cols-2`, then `lg`/`xl` desktop layouts. Evidence: `apps/web/src/app/(dashboard)/dashboard/page.tsx:47-49,133,185,195,234,293` and `apps/web/src/components/dashboard/kpi-card.tsx:107-136`.

The shell owns page padding: `p-3` mobile, `sm:p-6`, `md:p-8`; Tailwind's optional centered container is `1.5rem` padded and capped at `1280px` at `2xl` (`apps/web/src/components/shell/app-shell.tsx:117`, `apps/web/tailwind.config.ts:8-12`). Keep wide tables in their own horizontal-scroll wrapper rather than widening the shell (`components/ui/table.tsx:5`).

## Typography and icons

- Default UI font is **Cairo** (Arabic + Latin subsets) via `--font-sans`; use the existing `font-sans`. **IBM Plex Sans Arabic** is an exception scoped to the daily-360 report (`apps/web/src/app/layout.tsx:2-24`, `tailwind.config.ts:65-69`).
- Dominant hierarchy: page hero `text-2xl font-bold sm:text-3xl`; section `text-xl font-semibold`; card title `text-base font-semibold leading-none tracking-tight`; body/labels `text-sm`; supporting/caption `text-xs text-muted-foreground`; numerical KPIs use `font-semibold`/`font-bold`, `tracking-tight`, and `tabular-nums` (`dashboard/page.tsx:47-49,289-305`, `components/ui/card.tsx:14-24`).
- Icons are Lucide, typically `h-4 w-4` in controls, `h-5 w-5` in headings/nav, and a 9–10px rounded module badge. Decorative icons live in semantic-tinted, low-opacity badge fills; do not introduce a second icon system (`components/shell/app-shell.tsx:67-73,148-153,238-259`).

## Components and interaction states (explicit)

| Component | Production rule |
| --- | --- |
| Button | `rounded-md text-sm font-medium`, `gap-2`, focus-visible 2px ring + offset, active `.98` scale, disabled opacity 50. Default is primary + shadow; outline is border/input + transparent; secondary/ghost use secondary. Heights: default 44px mobile / 36px `sm`, small 40/32, large 48/40, icon 44/36 (`components/ui/button.tsx:6-28`). |
| Inputs/selects | `rounded-md border-input bg-background px-3 text-sm shadow-sm`; 44px mobile / 36px `sm`; muted placeholder; focus 1px ring; disabled 50% opacity (`components/ui/input.tsx:8-23`, `components/ui/select.tsx:13-28`). Search is the deliberate exception: `rounded-full bg-background/60` with 2px primary ring (`components/shell/app-shell.tsx:238-245`). |
| Card anatomy | `Card` adds `glass-surface`; Header `p-3 sm:p-6`, `gap-1.5`; Content/Footer repeat that padding with `pt-0`; title/description follow the typography above (`components/ui/card.tsx:4-36`). |
| Dialog/popover | Dialog overlay is `black/70 backdrop-blur-sm`; content is `rounded-lg border bg-card p-3 sm:p-6 shadow-lg`, max 90dvh and `max-w-lg`. Menus/select content are `rounded-md`/`rounded-xl`, border + popover + shadow (`components/ui/dialog.tsx:16-61`, `components/ui/select.tsx:31-66`). |
| Selection/hover | Selected sidebar item is `bg-gradient-to-l from-primary to-primary/80 text-primary-foreground shadow-md`; inactive links hover `secondary/60`; tabs use background + shadow for active; destructive actions hover `destructive/10` (`components/shell/app-shell.tsx:148-153`, `components/ui/tabs.tsx:15-29`). |

## State and responsive rules

- Use `Skeleton` (`animate-pulse rounded-md bg-secondary`) for route/content loading; dashboard loading preserves the target card grid. Small action-level waits may use `Spinner`. Standard errors are compact `glass-card`/bounded text in `text-destructive`; dashboard empty states supply a visual, reason, and action (`components/ui/skeleton.tsx:3-5`, `app/(dashboard)/dashboard/loading.tsx:9-30`, `dashboard/page.tsx:41-42,192-214`).
- At `max-width:767px`, glass cards become `.875rem` with 8px blur and smaller shadows; hero is 1rem with 10px blur. `p-7/p-6/p-5/p-4` become `1rem/1rem/.875rem/.75rem`; `gap-6` becomes `.75rem`; all form controls have `min-height:44px`; fixed mobile navigation reserves bottom space (`globals.css:378-424`, `components/shell/app-shell.tsx:117-125`). At 480px, `gap-4=.625rem`; at 430px, two action columns collapse to one.

## RTL and Arabic (explicit)

Arabic/RTL is the default: `<html lang="ar" dir="rtl">`; switching locale updates both `lang` and `dir` before and after hydration (`apps/web/src/app/layout.tsx:50-62`, `components/translation-provider.tsx:31-37`). Use Tailwind logical properties (`ps`, `pe`, `ms`, `me`, `border-s/e`, `start/end`) and `text-start`, not physical left/right. Existing shell layout relies on flex direction inheriting RTL rather than JSX reordering (`components/shell/app-shell.tsx:60-68`). For split KPI separators, retain `divide-x-reverse` (`dashboard/page.tsx:305`).

## Conflicts and exceptions found

1. **Standardized primitives vs bespoke screens:** `Card` gives a shared glass surface, but several older/specialized pages still use local `rounded-* border bg-*` compositions. For new work, the dashboard shell + `components/ui` pattern is dominant; do not treat those local compositions as a second system.
2. **Hero is intentionally exceptional:** only one primary visual should receive `glass-hero`, aurora, reflection, or strong AI glow. Regular KPI and operational cards use `glass-card`.
3. **IBM Plex report font is intentionally scoped:** do not generalize it beyond the daily-360 summary.
4. **Dark premium is restricted:** the token comment states light premium is a muted placeholder; do not introduce a premium glow in light mode (`globals.css:52-61,92-103,281-287`).
5. **Mobile rules override nominal Tailwind sizing:** use the global mobile density pass rather than compensating with screen-specific shrinkage.

## Build checklist

1. Start with the shared component or utility; do not duplicate glass, button, or form formulas.
2. Give the page at most one hero; use semantic glow only when it communicates status, and only once per element.
3. Verify the approved Dark Mode treatment, Arabic RTL and English LTR, keyboard focus, empty/error/loading, desktop, 767px, 480px, and 430px. Preserve current Light Mode behavior unless Light Mode work is explicitly requested and approved.
4. Compare visual density with the dashboard home screen before calling the work complete. Any new visual language requires explicit approval.
