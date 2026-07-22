# Geo Intelligence Center — Product Design Document v1.1

Status: **Design only — not implemented.** This document is the design-review
artifact requested explicitly instead of a build ("لا تنفذ أي شيء، هاقولك كل
التفاصيل" → "Yes, proceed" once this doc is approved). Nothing described here
has been coded. Where a requirement wasn't explicitly given, this document
makes the call and flags it as **Proposed Design Decision** — review those in
one pass instead of a back-and-forth per detail.

**v1.1 change note.** A second review round added 10 ambition-level ideas
(unified heatmap language, AI confidence, decision impact simulation,
explainability, decision history, opportunity value, live decision canvas,
visual geographic story, executive mode, territory DNA score). Four were
pure UI/UX and folded directly into V1 (§2, §5.9, §5.11, §5.12, §6, §7, §8,
§9). Six require genuinely new backend/business logic — a forecasting
engine, historical outcome tracking, a confidence model — that goes beyond
"UI over data that already exists," so they're captured as a real roadmap in
the new **§10 Vision Layer**, not silently folded into V1 scope.

Two reference mockups anchor this document: an earlier broad concept
(Intelligence Library + heatmap + region panel + comparison + opportunity
ranking + export) and a more refined one ("Geo Intelligence Center" —
territory polygons colored by a 0–100 Health Score, 4-category sidebar, AI
Decision Panel with tabs, ranked "why," numbered action plan, comparison
charts, trend chart, quick tools). The refined mockup is treated as the
closer approximation of the target; the first is treated as an earlier
iteration of the same idea.

---

## 1. Vision

**What we're building:** Geo Intelligence Center is not a heatmap screen. It
is FSOS's Geographic Decision Intelligence hub — the place where geography
turns into a decision, not just a color.

**The 5-question test.** A manager opens the screen and should be able to
answer these five questions in under 30 seconds:

1. Where is the problem?
2. Why did it happen?
3. What is the best opportunity?
4. What should I do right now?
5. What's the expected return?

If the screen answers all five that fast, it succeeded. If it only answers
question 1 (today's Heat Map, largely), it's a map, not a decision system.

**The positioning line** (carried forward verbatim, it's the north star for
every design call in this document): *FSOS doesn't sell reports — it sells
decisions.* Power BI shows data. Tableau shows analytics. FSOS proposes a
decision.

**One map, many roles.** The same territory map serves Sales, Marketing,
Trade Marketing, Distribution, and Executive Management — but each role sees
recommendations relevant to *their* responsibility, not a one-size-fits-all
summary. See §6 (Role-Based Decisions) for how this works without forking
the screen five ways.

**Geo Intelligence vs. Territory Intelligence** — the distinction this whole
redesign hinges on:

| | Answers | Example |
|---|---|---|
| **Geo Intelligence** (what exists today) | *Where* | "North Jeddah is red." |
| **Territory Intelligence** (what's missing) | *What to do* | "This area declined because 12 customers stopped buying. Focus on 8 of them first. Reassign part of another rep's visits here. Expected recovery: 180K SAR in 2 weeks." |

Today's screen only does the left column. This redesign adds the right one.

---

## 2. UX Philosophy

- **Every element must serve a decision.** If a component only displays data
  and doesn't move the manager toward an action, it gets cut. This is the
  filter for every future addition to this screen, not just what's in this
  document.
- **The screen tells a story, not a table.** Clicking a region should read
  like a briefing, not a spreadsheet: location → health → why → opportunity
  → decision → expected impact, in that fixed order, every time.
- **Speed over completeness.** The default view must answer "where" in one
  glance (map colors, no click). A single click must answer "why" and "what"
  within the 30-second budget. Anything that needs more than one click to
  reach ("why is this bad") is a design failure for the primary path — extra
  depth (comparison, trend, ranking) is fine as secondary, lower-urgency
  content below the fold.
- **Never a bare number.** Every recommendation carries its reasoning and an
  expected outcome. This is not a new rule for FSOS — it's the same
  "no bare number, always a next step" principle SGI/Priority Center already
  enforces everywhere else in the app. This screen extends that principle to
  geography instead of inventing a new one.
- **Visual consistency over novelty.** Health Score tiers reuse the app's
  existing red → amber → green severity language (Priority Center already
  trained the user's eye on this) rather than a new color system. Familiar
  beats new.
- **The screen feels alive.** Every zone (map, ranking, trend, comparison,
  AI panel, story) reads off one shared selection state. Selecting a
  territory anywhere updates all of them at once, instantly — not five
  independent widgets that happen to sit on the same page. See §5.11 (Live
  Decision Canvas).

---

## 2.5 Placement — a new screen, not a replacement

**Explicit instruction:** Geo Intelligence Center ships as its **own new
screen** (new nav entry, new route), sitting **alongside** today's Heat Map
and Geo Intelligence/New Customer screens — it does not replace or remove
either of them for V1. This lets the new decision-centric experience prove
itself without disrupting workflows already built around the existing
screens. Consolidating or retiring the older screens, if it ever happens, is
a separate future decision, not part of this document's scope.

## 3. Information Architecture

Six zones, top to bottom:

1. **Top bar** — title, company/scope context, Smart Filters row (Period,
   Branch, Sector, Rep, Category, Brand + a "Smart Filter" preset picker),
   notifications, help, export shortcut, user profile. Reuses the existing
   FSOS shell header pattern (same as every other dashboard screen).
2. **Left sidebar — Intelligence Library**, regrouped into 4 categories:
   - 📊 **Performance** — Sales Growth, Sales Trend, Average Order Value, Order Frequency
   - ⚠️ **Risk** — Lost Sales, Inactive Customers, Customer Churn, Coverage Gaps
   - 💡 **Opportunity** — Cross-Sell, AI Opportunity, White-Space Areas, Expansion Opportunities
   - 🗺️ **Territory Intelligence** — Territory Health, Territory Ranking, Territory Comparison, Territory Story
3. **Center — the Map** (hero element, majority of screen real estate).
   Territory-level, colored by whichever Library item is active; default
   mode colors by Health Score.
4. **Right panel — AI Decision Panel** (collapsed by default, opens on
   region click). Tabs: Summary / Performance / Risk / Opportunity /
   Comparison. Summary tab is what loads first and carries the 5-question
   answer set.
5. **Bottom band** — Territory Ranking (by opportunity), Region Comparison
   mini-tool, 6-month Trend chart, Top Opportunities cards.
6. **Footer toolbar — Quick Tools** — Export (Link / Image / PDF / PPT),
   Save Region, Create Alert, Share with Team, Generate Comprehensive
   Report.

---

## 4. User Journey

1. **Open the screen.** Default view = Territory Health map, default scope
   (the viewer's own hierarchy-filtered territory set — same row-level
   visibility FSOS already enforces everywhere via RIE). Every territory is
   colored by its Health tier. *Question 1 answered in one glance.*
2. **Scan.** The manager's eye goes straight to red/orange regions — that's
   the point of the color system.
3. **Click a region.** The AI Decision Panel slides in from the right.
   Summary tab loads: Health Score badge, ranked "Why" list, Smart
   Recommendation paragraph, Suggested Decision checklist, expected-impact
   figure. *Questions 2–5 answered without leaving the panel.*
4. **Act.** Three paths from here, all one click away:
   - **"Create Visit Plan for Region"** → hands off into the existing visit
     planning flow, scoped to this territory.
   - **Switch to Comparison tab** → benchmark this region against another,
     or against its own trend.
   - **Quick Tools** → export, share, or flag the region.
5. **Optional deeper dive.** Switching the Library category (e.g., to Risk)
   recolors the map by that specific metric instead of the composite Health
   Score — for a focused investigation once the manager already knows
   *which* region they care about.

Target: steps 1–4 inside 30 seconds for a manager who already knows the
screen.

---

## 5. Components

### 5.1 The Map
Territory-level choropleth (filled regions, not individual point clusters —
a deliberate change from today's Heat Map, which plots points/blobs). Fill
color = the active Library layer's metric; default = Health Score. Standard
zoom/pan/fullscreen controls, carried over from the existing Heat Map
component.

> **Proposed Design Decision — territory boundaries.** FSOS has no drawn
> polygon/GeoJSON boundary data today (no "this is the exact shape of North
> Jeddah" source). V1 approximates each named area's boundary the same way
> today's Heat Map already visually clusters points — a smoothed blob around
> that area's customer coordinates — just re-skinned as a solid tier color
> instead of a gradient, rather than solid administrative polygons. True
> polygon boundaries are backlog (§9).

### 5.2 Intelligence Library (sidebar)
The 4 categories are a *regrouping* of FSOS's existing map/analysis catalog
(Heat Map layers, Lost Sales Map, Category Distribution, Customer
Similarity, Route Coverage, AI Opportunity Map, etc.) under decision-shaped
headers — not a new set of analyses invented for this redesign.

> **Proposed Design Decision — category assignment.** Exact mapping of each
> existing analysis into one of the 4 categories:
> - **Performance:** Growth Map, Sales Trend view, Average Order Value, Order Frequency
> - **Risk:** Lost Sales Map, Inactive Customers, Customer Churn view, Route Coverage Map (reframed as "coverage gaps")
> - **Opportunity:** Cross-Sell / AI Opportunity Map, New Customer Expansion Map, Territory Opportunity Map
> - **Territory:** the 4 new items below (5.4)

### 5.3 Smart Filters
Same filter dimensions the current Heat Map already supports (Period,
Branch, Sector, Rep, Category, Channel, Brand).

> **Proposed Design Decision — "Smart Filter."** For V1, this is a
> saved-preset picker (e.g. "This month, my team only," "This quarter, high
> risk only") — not an AI-driven filter-suggestion engine. Keeps it a pure
> UI/UX feature per the V1 scope guideline (§9), with no new backend
> inference required.

### 5.4 Territory Health Score
A single 0–100 score per territory, driving the default map color and the
ranking table. Five tiers, matching the refined mockup exactly:

| Tier | Range | Label |
|---|---|---|
| Excellent | 80–100 | ممتاز |
| Good | 60–80 | جيد |
| Average | 40–60 | متوسط |
| Weak | 20–40 | ضعيف |
| Very Weak | 0–20 | ضعيف جدًا |

> **Proposed Design Decision — scoring model (per explicit instruction: no
> hardcoded weights, must be configurable).** Health Score is a weighted
> composite of metrics FSOS **already computes** elsewhere — no new data
> collection required, only new aggregation at the territory level:
>
> | Metric | Existing source |
> |---|---|
> | Sales Growth % | Heat Map / SGI growth comparison |
> | Active Customer Rate (inverse of churn) | SGI `CUSTOMER_INACTIVE` |
> | Lost Sales volume | SGI `LOST_SALES` |
> | Visit Coverage % | Visit Efficiency |
> | Collection Health | SGI `COLLECTION_RISK` |
>
> Each metric is normalized to 0–100, then combined via a **configurable
> weight table** (default: equal-weighted, 20% each — a neutral starting
> point, not a claim that all 5 matter equally for every business). The
> weight table lives at the company level so different companies (FMCG vs.
> pharma vs. distribution) can tune what "healthy" means for them — this is
> a settings surface, not a fixed formula. Building the actual admin UI to
> edit weights is backlog (§9); V1 ships the model and sensible defaults.

### 5.5 AI Decision Panel
Opens on region click. 5 tabs: Summary, Performance, Risk, Opportunity,
Comparison. **Summary is the one that must hit the 30-second budget** and
contains, in fixed order:

1. 📍 Region name + Health Score badge
2. ❓ **Why** — ranked list of causes, each with its own delta (e.g. "−22%
   Sales decline," "18 inactive customers," "42 lost sales") — reusing the
   same icon/severity language already established in Priority Center
   (`SituationCard`'s type icons and severity colors), not a new icon set.
3. 💡 Smart Recommendation — one paragraph.
4. 🎯 Suggested Decision — a numbered, checkable action list (2–4 items).
5. 💰 Expected impact — one highlighted figure (SAR value + timeframe).
6. Primary CTA: **"Create Visit Plan for Region."**

> **Proposed Design Decision — where "Why" and "Recommendation" text comes
> from.** Per the V1 scope guideline (assume required data already exists,
> no new backend/business logic), the Why list and Smart Recommendation are
> **templated sentences assembled from the region's existing SGI
> situations** (the same real, already-computed `LOST_SALES` /
> `CUSTOMER_INACTIVE` / `COLLECTION_RISK` / `PRODUCT_DECLINE` /
> `GROWTH_OPPORTUNITY` records that already power Priority Center) —
> filtered to that territory's customers/reps, ranked by severity, and
> phrased through a fixed sentence template per situation type. This is
> **not** a new free-form LLM narrative generator — it's a new *view* over
> data FSOS already has, which is exactly what "UI experience assuming the
> data already exists" means here.

### 5.6 Territory Story
A Library item under the Territory category — the same "why + opportunity +
decision" framing as the Decision Panel, but written as one continuous
paragraph instead of discrete fields, for a region selected from the
ranking list rather than clicked on the map.

> **Proposed Design Decision.** Same templated-sentence approach as 5.5,
> stitched into paragraph form. No new generation logic — this is a second
> presentation of the same underlying SGI data, not a second data source.

### 5.7 AI Mission button
Generates a prioritized visit list for a territory.

> **Proposed Design Decision.** V1 reuses Visit Copilot's existing
> daily-brief / route-priority logic (already built, already computing "who
> to visit first and why") scoped to the selected territory's reps, exposed
> as a new entry point into that existing flow. This is explicitly **not** a
> new planning engine — it's a shortcut into one that already exists,
> matching "no new backend or business logic" for V1.

### 5.8 Comparison Tool
Two-region or region-over-time side-by-side deltas (bar chart, red/green
per metric) — reuses the same "compare two things" visual language already
established in the Customer Comparison feature, applied at territory level
instead of customer level.

### 5.9 Ranking table / Trend chart / Top Opportunity cards
- **Ranking:** territories sorted by Health Score (or by opportunity value
  when that Library item is active).
- **Trend:** 6-month line chart of a territory's Health Score.
  > **Proposed Design Decision.** Trend requires a stored monthly snapshot
  > of each territory's Health Score going forward. Before this feature
  > ships there's no history to show — the chart displays only the months
  > available (clearly labeled as a partial series), never a fabricated
  > backfill.
- **Top Opportunity cards:** the highest-value items from that territory's
  existing SGI `GROWTH_OPPORTUNITY`/`PRODUCT_DECLINE` situations, same
  source as 5.5. Each card shows an **opportunity value** (the SAR figure
  SGI already attaches to the situation) and a **priority** ranking derived
  from severity + value together, so the top card is always "biggest,
  clearest win," not just "biggest number."
  > **Proposed Design Decision — Opportunity Value scope.** Financial value
  > and priority ranking are in V1 because SGI already computes both today.
  > What's explicitly **not** in V1: execution-speed estimates ("how fast
  > can this be closed") and success-probability scoring — neither exists
  > anywhere in FSOS yet, and inventing them would be new business logic,
  > not a UI arrangement of existing data. See §10 for that as a roadmap
  > item.

### 5.10 Quick Tools
Export (Link / Image / PDF / PPT), Save Region, Create Alert, Share with
Team, Generate Comprehensive Report.

> **Proposed Design Decision — V1 vs. backlog split.** Export and Share ship
> in V1 (PPT reuses the pptxgenjs Reports pipeline already built this
> project; image/PDF/link export follow the same export patterns already
> used elsewhere in FSOS). **Save Region** and **Create Alert** are backlog
> — both imply new persistence/notification plumbing (a saved-item store, an
> alert-trigger/notification-delivery system) that goes beyond "UI over data
> that already exists," so they don't fit the V1 scope guideline.

### 5.11 Live Decision Canvas — the state model
The screen's zones (map, ranking, trend, comparison, AI Decision Panel,
Territory Story) are not independent widgets that each fetch their own
"selected region" — they read off **one shared selection state** for the
whole screen. Selecting a territory (from the map, the ranking list, or a
Library sub-item) updates all bound zones at once, in place, without a page
reload or a "refresh" click.

> **Proposed Design Decision.** This is pure frontend state management (a
> single `selectedTerritoryId` + `activeLibraryItem` held at the screen
> level, passed down to each zone as props/context) — no new backend
> endpoint or business logic is required, since every zone already reads
> from data the existing APIs return. This is what makes the screen feel
> "alive" per §2, and it's the same reactive-state pattern already used
> elsewhere in FSOS (e.g. filters driving both the Heat Map and its legend
> simultaneously), just applied consistently across more zones at once.

### 5.12 Executive Mode
A role-conditional simplified view for Executive Management: instead of the
full map-first layout, the screen opens (or can be toggled) into a compact
summary — **Top 5 opportunities, Worst 5 territories, Fastest win, Biggest
risk** — four short ranked lists, each item still carrying the map's
underlying Health Score and one-line reasoning, but without requiring a
click into individual territories to get the portfolio-level picture.

> **Proposed Design Decision.** Executive Mode is a different **arrangement**
> of the same components already defined in §5.4–§5.9 (Health Score,
> Ranking, Top Opportunity cards) — not a new data source or scoring model.
> It reuses the role-based framing already defined in §6 for Executive
> Management and simply presents it as the default landing view for that
> role instead of requiring a map click first, consistent with "executives
> want the answer, not the map" being the whole point of §6's Executive row.
> The map remains one click away (a "View Map" toggle) for when an executive
> wants to drill into a specific territory.

---

## 6. Role-Based Decisions

Same map, same underlying data, same Health Score — the Suggested Decision
and Smart Recommendation text in the AI Decision Panel change based on the
viewer's role, because each role's "what should I do" is different for the
identical underlying situation:

| Role | What "what to do" means for them |
|---|---|
| **Sales** | Visit prioritization, rep reassignment, target recovery actions |
| **Marketing** | Which products/categories to push in this territory, promotion targeting |
| **Trade Marketing** | Distribution gaps, shelf/placement opportunities, channel-specific plays |
| **Distribution** | Route efficiency, coverage gaps, van-load/logistics implications |
| **Executive Management** | Portfolio-level view — which territories need investment/attention company-wide, financial impact rollups. Lands directly in **Executive Mode** (§5.12) instead of the map-first view: Top 5 opportunities, Worst 5 territories, Fastest win, Biggest risk, each traceable back to the same map on request. |

> **Proposed Design Decision.** The underlying SGI situations already carry
> a `type` (LOST_SALES, PRODUCT_DECLINE, GROWTH_OPPORTUNITY, …) — the
> Suggested Decision template picks which situation types to surface and
> which action phrasing to use **based on the viewer's role**, reusing
> FSOS's existing role model (`SALES_REP` / `SUPERVISOR` / `MANAGER` /
> `COMPANY_ADMIN`) and hierarchy-scoping (a `MANAGER` or above sees the
> portfolio rollup framing; a role closer to the field sees the
> visit/rep-level framing). This is a **presentation-layer mapping**
> (which existing situations to lead with, which sentence template to use),
> not new per-role data or a new per-role scoring model — Health Score
> itself stays identical across roles; only the recommendation text and
> which situations are foregrounded change.

---

## 7. Interaction Rules

| Trigger | Result |
|---|---|
| Open screen | Map renders, Territory Health mode, viewer's default hierarchy scope, no panel open |
| Click a territory on the map | AI Decision Panel opens (right), Summary tab active, scrolls into view |
| Click a different territory while panel is open | Panel content swaps in place (no close/reopen animation needed) |
| Click the panel's ✕ | Panel closes, map returns to full width |
| Switch AI Decision Panel tab | Content area swaps within the same panel; Health Score badge stays pinned at top across all tabs |
| Change a Smart Filter | Map recolors and all bottom-band widgets (ranking, trend, opportunity cards) recompute for the new filter scope |
| Click a Library category header | Expands/collapses that category's sub-items; does not change the map by itself |
| Click a Library sub-item | Map recolors by that metric; if a territory is currently selected, the Decision Panel's relevant tab (matching the category) becomes active |
| Click "Create Visit Plan for Region" | Hands off to the existing visit-planning flow, pre-scoped to the selected territory |
| Click a Quick Tool | Export tools trigger an immediate download/share action; no separate confirmation screen for V1 |
| Click Comparison tab, then pick a second region | Comparison chart populates below; picking is via the same region list used in Ranking |
| Selection state changes (any zone) | All bound zones (map highlight, ranking highlight, Decision Panel, trend, comparison) update together from the one shared state — no zone lags or requires its own refresh (§5.11) |
| Executive role opens the screen | Executive Mode (§5.12) loads by default instead of the map-first view; "View Map" toggle available to drop into the standard map view at any time |

---

## 8. UI Rules

- **Reuse, don't reinvent.** This screen adopts FSOS's existing shell (top
  bar pattern, sidebar nav pattern, glass/dark-navy theme with per-module
  accent colors, dark/light mode support, and the app's established
  Arabic-RTL / English-LTR bilingual handling) rather than introducing a new
  visual system. The two reference mockups' dark theme should be read as
  *this screen's module accent*, consistent with how other modules already
  carry their own accent color within the same shell.
- **Health tiers reuse the existing severity palette.** FSOS already has a
  3-tier severity system (destructive/warning/success — red/amber/green)
  used throughout Priority Center. Health Score needs 5 tiers.
  > **Proposed Design Decision.** Extend the existing 3-color family to 5
  > tiers by interpolating two additional stops within the same hue range
  > (a deeper red for "Very Weak," a lighter green for "Excellent") rather
  > than introducing unrelated colors — keeps the whole app's color
  > language consistent instead of this screen having its own palette.
- **Icons:** situation-type icons in the Decision Panel's "Why" list reuse
  the exact icon set already assigned per `SgiSituationType` in Priority
  Center (`TYPE_ICON` map) — no new icon language for the same underlying
  concepts.
- **Responsive behavior:** Decision Panel becomes a bottom sheet (not a side
  panel) below the existing app's tablet/mobile breakpoint, consistent with
  how other FSOS panels already collapse on small screens.
- **RTL:** all of the above mirrors correctly in Arabic — panel opens from
  the visual left in RTL (same logical "trailing edge" the rest of the app
  already uses), not hardcoded to a physical side.
- **One color language, everywhere on the screen.** The same Health Score
  tier colors (§5.4) are used identically on the map fill, the ranking list,
  the Top Opportunity cards, the comparison chart, and (once it exists) the
  trend line — a region that reads "orange" on the map must read the exact
  same orange everywhere else it appears on this screen. No zone gets its
  own separate color scale.

---

## 9. Scope

### In scope for V1
- Full screen redesign per §3–§7: map, 4-category Library, Smart Filters
  (preset-picker form), AI Decision Panel (all 5 tabs), Territory Health
  Score (computed from existing metrics via a configurable-but-not-yet-
  admin-editable weight model), Territory Story, AI Mission (as an entry
  point into the existing Visit Copilot flow), Comparison Tool, Ranking,
  Trend chart (partial history until snapshots accumulate), Top Opportunity
  cards (with financial value + priority, §5.9), Export + Share quick tools.
- Role-based recommendation framing (§6) reusing the existing role model.
- Ships as its own new screen/nav entry/route, alongside — not replacing —
  today's Heat Map and Geo Intelligence/New Customer screens (§2.5).
- Live Decision Canvas: one shared selection state driving every zone
  reactively (§5.11).
- Executive Mode: role-conditional simplified landing view for Executive
  Management (§5.12).
- Unified Health Score color language reused identically across every zone
  of the screen (§8).

See §10 for the larger vision items deliberately deferred beyond V1.

### Explicitly out of scope for V1 (backlog)
- **True polygon/GeoJSON territory boundaries** — V1 approximates with
  clustered blobs (§5.1).
- **Free-form/LLM-generated narrative text** for Territory Story or Smart
  Recommendation — V1 uses templated sentences over real SGI data (§5.5,
  §5.6). A genuinely generative narrative layer is a future upgrade, not a
  V1 requirement.
- **Company-level Health Score weight editor UI** — the model is
  configurable by design, but the settings screen to let an admin actually
  change weights is backlog; V1 ships with defaults (§5.4).
- **Save Region / Create Alert** — need new persistence/notification
  plumbing, deferred (§5.10).
- **Full historical trend backfill** — no fabricated history; the trend
  chart grows from whenever this feature ships (§5.9).

---

## 10. Vision Layer — Beyond V1 (Roadmap)

These six ideas were raised in the second feedback round and are genuinely
strong — several are the kind of thing that would make Geo Intelligence
Center best-in-class. They are **not V1** because each one needs real new
backend/business logic, not just a new arrangement of data FSOS already
computes. Listed here so they're captured and not lost, each with what it
would actually take to build:

1. **AI Confidence score** — a "how sure is the system" indicator on every
   recommendation. Needs: a genuine confidence model (e.g. based on data
   completeness, sample size, situation consistency over time) — nothing in
   FSOS today produces a confidence figure; inventing one without a real
   model would be a fabricated number, which violates §2's "never a bare
   number" principle in spirit even if it technically has one attached.
2. **Decision Impact Simulation** — "if I approve this, here's the
   projected effect" before committing. Flagged by the user as one of the
   strongest ideas. Needs: a forecasting/simulation engine that can project
   forward from a hypothetical action — a materially new capability, not
   something any existing FSOS module does today.
3. **Explainability — why this recommendation and not an alternative** —
   goes beyond the current "why" (which explains the situation) to also
   explain the *recommendation choice itself* against other options
   considered. Needs: the recommendation engine to reason over multiple
   candidate actions and score them comparatively — an extension of the
   templated-sentence approach in §5.5 into something closer to real
   decision-support logic.
4. **Decision History & Outcome Tracking** — a timeline per territory:
   Decision → Executed → Result → New Health Score, so managers can see
   whether past recommendations actually worked. Needs: a new persistent
   data model recording which recommendations were acted on, when, and
   what happened after — none of this is tracked anywhere in FSOS today.
5. **Geographic Story as a visual timeline** — turning Territory Story
   (§5.6) into a scrollable timeline of real events ("new competitor
   entered," "3 customers churned," "promotion ran"), not just a paragraph.
   Depends directly on #4 (there's no event history to draw a timeline
   from). **Explicit risk flagged:** without real recorded events, a
   timeline UI creates pressure to fabricate plausible-sounding entries —
   which would directly violate this document's own "never a fabricated
   backfill" rule (§5.9). This only becomes safe to build once #4 exists
   and is feeding it real, dated events.
6. **FSOS DNA Score / territory personality labels** — classifying
   territories into archetypes (e.g. "high-growth, high-risk," "stable
   cash cow") beyond the single 0–100 Health Score. Needs: a new
   rule-based (or model-based) classification layer on top of Health
   Score's existing metrics — a genuinely new scoring dimension, not a
   restyling of the existing one.

**How to read this section:** none of the six above block V1 shipping, and
none of V1's design (§1–§9) needs to change to accommodate them later —
each builds *on top of* data structures V1 already establishes (SGI
situations, Health Score metrics, the selection-state model). When it's
time to scope any of these, it deserves its own short design pass rather
than being squeezed into this document after the fact.

---

*Document created 2026-07-21 per explicit request: a single design-review
pass instead of a build, updated to v1.1 the same day after a second
feedback round. Every item marked "Proposed Design Decision" above is this
document's own call, made per the stated guidelines (configurable Health
Score, V1 = UI/UX over existing data, role-based recommendations over
shared data, ships as a new screen alongside existing ones) — flag any of
them for a different call in one review pass rather than re-litigating the
whole document. §10 captures the ideas deliberately kept out of V1 because
they need real new logic, not because they aren't worth building.*
