# FSOS 360 / Customer 360 — Master Specification for Codex

## 0. Read This First

This file consolidates the five approved FSOS 360 documents into one implementation source for Codex.

The original documents are one roadmap, not five independent tasks:

1. Master Roadmap (`01`)
2. FSOS 360 Philosophy
3. FSOS 360 Interaction Blueprint
4. FSOS 360 Screen Components
5. FSOS 360 Implementation Prompt

Read this entire file before writing code.

The task is to implement an **Executive Decision Workspace**, not a traditional dashboard, reporting screen, report viewer, or analytics dump.

The architectural diagrams communicate:
- information hierarchy;
- component relationships;
- interaction flow;
- decision flow;
- workspace behavior.

They are **not** the final visual design. Do not copy their colors, shadows, borders, typography, icons, spacing, or card styling. Follow the existing FSOS design system and project conventions.

---

# 1. Product Purpose

FSOS 360 is a single executive workspace that gives a complete, connected view of any supported sales entity.

Its purpose is not only to show data. It must help the user move through:

**Data → Understanding → Decision → Action**

The workspace must explain:

- What happened?
- Compared with what?
- What changed?
- Where did the change begin?
- Why does it matter?
- What deserves attention?
- What practical next step may be appropriate?

The final business decision always belongs to the human user.

---

# 2. Golden Product Principles

## 2.1 Support Decisions, Do Not Make Decisions

FSOS provides information, interpretation, opportunities, and advisory recommendations.

It must not:
- make the final decision;
- control the user;
- present recommendations as mandatory instructions.

## 2.2 Explain, Do Not Judge

The system explains performance and changes. It never blames, accuses, evaluates a person morally, or assigns fault.

Avoid language such as:
- failed;
- made a mistake;
- is responsible;
- must.

Use advisory language such as:
- May be appropriate to review...
- Recommended to follow up...
- Worth investigating...
- This area may deserve additional attention...

## 2.3 Every Number Needs Context

Never display an isolated KPI.

Every KPI must include:
- current value;
- previous/reference value;
- growth or decline;
- short business meaning.

## 2.4 Comparison Is the Default

The default analysis is comparative, not a static snapshot.

Default state:
- Current Period: current month.
- Comparison Period: previous month.

The user must see results immediately without mandatory setup.

## 2.5 Business Language First

Use executive and business language, not technical analytics terminology where a clearer business phrase exists.

Prefer:
- Good growth
- Decline requiring attention
- Promising opportunity

Avoid unexplained technical labels such as:
- Delta
- Metric
- Variance

---

# 3. One Workspace for All Analysis Levels

Do not build a different architecture for each entity.

The same FSOS 360 workspace changes according to the selected analysis entity:

- Company
- Region / City
- Branch
- Manager
- Supervisor
- Route
- Sales Representative
- Customer
- Brand
- Category
- Product

Customer 360 is one analysis state inside this unified workspace, not a separate unrelated dashboard architecture.

---

# 4. Important Entity Semantics

## 4.1 Route 360

Route analysis evaluates the route itself, regardless of the currently assigned representative.

Main question:

**Is this route achieving the expected performance?**

The route is treated as a persistent operational entity even if the assigned representative changes.

## 4.2 Sales Representative 360

Sales Representative analysis evaluates the person and the development of that person's performance across routes worked.

Main question:

**How has this representative's performance evolved across the routes they worked on?**

Do not merge Route 360 and Sales Representative 360 into the same semantic analysis.

---

# 5. Default Screen State

On first open:

- Current Period = Current Month
- Comparison Period = Previous Month
- Results load immediately.
- Executive Insight is visible near the top.
- The workspace uses the authenticated user's permitted scope.
- The user should not need to configure the screen before seeing useful analysis.

---

# 6. Filter Workspace

## 6.1 Filter Order

The workspace contains:

1. Current Period
2. Comparison Period
3. Company
4. Region / City
5. Branch
6. Manager
7. Supervisor
8. Route
9. Sales Representative
10. Customer
11. Brand
12. Category
13. Product

## 6.2 Cascading Behavior

Filters are hierarchical and cascading.

Each selection limits the valid values of filters below it.

Example:

Selecting `Region = Jeddah` must limit downstream choices to valid Jeddah entities, such as:
- Jeddah branches;
- Jeddah managers;
- Jeddah supervisors;
- Jeddah routes;
- Jeddah sales representatives;
- context-valid customers, brands, categories, and products.

The system must not display all values at once when the context already narrows them.

## 6.3 Context Preservation and Invalid Selection Removal

When a higher-level filter changes:

- rebuild all dependent filters;
- preserve still-valid selections where possible;
- automatically remove selections that are no longer valid;
- never keep stale hidden values affecting analysis.

Example:

Changing city from Jeddah to Makkah must refresh routes, supervisors, representatives, customers, and other dependent choices.

## 6.4 Selection Rules

- Company: single-select.
- Downstream slicers: support multi-select where meaningful.
- The user may analyze groups of regions, products, categories, brands, representatives, or other entities.

## 6.5 Slicer-First Principle

When the number of choices is small, prefer visible slicer-style options rather than forcing a dropdown.

When the number is large, use a Smart Slicer with:
- search;
- scroll;
- multi-select;
- clear selection;
- concise selected-value summary.

Typical Smart Slicer candidates:
- Customers
- Products
- SKUs
- Sales Representatives
- other large datasets

## 6.6 Instant Unified Refresh

Any change to:
- current period;
- comparison period;
- any filter;

must refresh the entire workspace together.

There must be no isolated analytical widget refresh.

All components share:
- the same filters;
- the same analysis context;
- the same current period;
- the same comparison period;
- the same data source.

---

# 7. Approved Screen Hierarchy

The screen order must reflect how an executive thinks, not the physical order of source tables.

Required hierarchy:

1. Filter Workspace
2. Executive Insight
3. KPI Summary
4. Performance Comparison
5. Timeline
6. Target, when applicable
7. Visualization Workspace
8. Opportunities
9. Recommendations

Do not:
- invent extra analytical sections;
- remove approved sections;
- duplicate the same information across sections.

Every component must answer a clear executive question.

---

# 8. Component Specifications

## 8.1 Filter Workspace

Purpose:
- define the entire analysis context.

Contains:
- current period;
- comparison period;
- all supported hierarchy and entity slicers.

Rules:
- cascading;
- smart slicers;
- multi-select where applicable;
- instant unified refresh.

## 8.2 Executive Insight

Purpose:
- provide the first and fastest executive understanding of the current situation.

It must answer:
- What happened?
- Compared to what?
- What is the most important change?
- Why does it deserve attention?

Rules:
- always near the top;
- maximum approximately five lines;
- executive language;
- minimal numbers;
- no blame;
- no judgment;
- no generic filler.

## 8.3 KPI Summary

Purpose:
- show the most important performance indicators.

Potential KPI examples:
- Sales
- Collection
- Returns
- Strike Rate
- Productivity
- Coverage
- Lost Sales

Every KPI must show:
- Current Value
- Previous Value
- Growth / Decline
- Business Meaning

Never show isolated numbers.

## 8.4 Performance Comparison

Purpose:
- provide a structured current-versus-previous comparison.

May include:
- Current
- Previous
- Variance
- Change %
- Trend

Rule:
- no KPI exists without a meaningful comparison context.

## 8.5 Timeline

Purpose:
- show performance development over time.

Possible periods:
- last 12 months;
- last 6 months;
- last 30 days;
- a timeline appropriate to the selected period.

Used to explain:
- trends;
- seasonality;
- changes over time;
- whether movement is sustained or temporary.

## 8.6 Target

Purpose:
- explain target, achievement, remaining amount, and comparison with previous achievement.

Shows:
- Target
- Achievement
- Achievement %
- Remaining
- Previous Achievement

Target appears only at levels with direct sales responsibility:

- Company
- Region
- Branch
- Manager
- Supervisor
- Sales Representative

Target does not appear for:

- Route
- Customer
- Brand
- Category
- Product

Do not invent a target for analytical entities that do not directly own one.

## 8.7 Dynamic Visualization Workspace

Implement exactly one Visualization Workspace.

Do not implement a permanently fixed map component.

The workspace chooses or displays the visualization most appropriate to the current business question.

Possible visualizations:
- Sales Heat Map
- Collection Heat Map
- Returns Heat Map
- Opportunity Map
- Timeline
- Line Chart
- Bar Chart
- Treemap
- Coverage Map
- Route Map
- Customer Density Map
- performance by category
- performance by product

Example context mapping:
- Sales Distribution → Heat Map
- Geographic Coverage → Coverage Map
- Performance Over Time → Timeline / Line Chart
- Product Mix → Treemap
- Category Performance → Bar Chart
- Customer Density → Density Map
- Route Performance → Route Map

Rules:
- only one visualization workspace exists;
- visualization type changes according to context;
- the user may manually switch visualization when appropriate;
- the container location and size remain stable;
- changing visualization must not shift the rest of the screen.

## 8.8 Opportunities

Purpose:
- surface only the most important opportunities.

Examples:
- Cross Sell
- Upsell
- Growth
- Coverage
- Distribution
- Product Opportunity

Rules:
- show top opportunities only;
- explain existence, size, or significance where supported;
- do not turn FSOS 360 into an opportunity-management screen;
- allow navigation to a specialized screen when such navigation already exists.

## 8.9 Recommendations

Purpose:
- suggest practical next steps.

Examples:
- review a route;
- review a customer;
- increase coverage;
- follow up collection;
- investigate an unusual change.

Rules:
- advisory language only;
- no blame;
- no judgment;
- no mandatory wording;
- recommendations must remain grounded in the selected analysis context.

---

# 9. Component Visibility

## Always available where data supports the selected entity

- Filters
- Executive Insight
- KPIs
- Performance Comparison
- Timeline
- Opportunities
- Recommendations

## Target visibility

Visible:
- Company
- Region
- Branch
- Manager
- Supervisor
- Sales Representative

Hidden:
- Route
- Customer
- Brand
- Category
- Product

## Visualization visibility

The Visualization Workspace remains part of the architecture, but its available visualization and content depend on the selected context and available data.

Do not show a meaningless map merely to fill space.

---

# 10. Unified Workspace State

The screen is one analytical workspace.

No analytical component may own a conflicting independent context.

All components must derive their data from:
- one current analysis context;
- one filter state;
- one current period;
- one comparison period.

Local presentational state is acceptable when needed for UI behavior, but it must not create a second analytical context.

---

# 11. UX Requirements

The user should understand the situation within seconds.

Optimize for:
- fewer clicks;
- less navigation;
- less scrolling;
- lower cognitive effort;
- clear visual hierarchy;
- readable comparisons;
- fast entity access.

Prioritize:
- hierarchy;
- spacing;
- alignment;
- consistency;
- readability.

Avoid decorative UI that does not improve understanding or decision-making.

---

# 12. Visual Design Direction

Do not copy the visual styling of the supplied blueprints.

Use:
- the existing FSOS design system;
- existing reusable components;
- existing spacing, typography, color, and theme conventions;
- responsive behavior consistent with the project.

The experience should feel:
- premium;
- elegant;
- modern;
- executive;
- AI-powered;
- high-end;
- minimal but polished.

Visual polish must support clarity. Decision-making comes before decoration.

---

# 13. Hard Scope

Implement only the FSOS 360 workspace and directly related new components required for it.

Do not modify:
- unrelated screens;
- backend services;
- API contracts;
- database schema;
- project architecture;
- unrelated shared code;
- unrelated features.

Do not refactor unrelated code.

If a backend, API, schema, or architecture change appears necessary:

1. STOP.
2. Explain the exact missing capability.
3. Identify why the screen cannot meet the approved specification without it.
4. Wait for explicit approval.

Do not silently add mock business logic that pretends the missing backend capability exists.

---

# 14. Implementation Rules

- Write production-quality code.
- Follow existing project conventions.
- Keep components reusable where useful.
- Avoid unnecessary complexity.
- Avoid duplicate logic.
- Keep user-facing text inside the existing i18n system.
- Do not invent new product behavior not supported by this specification.
- Do not remove an approved component because implementation is difficult.
- Do not duplicate information across components.
- Preserve existing permission and scope behavior.
- Do not create manual role or scope selectors that bypass authenticated hierarchy.

---

# 15. Required Pre-Implementation Workflow

Before writing code:

1. Read this file completely.
2. Inspect the existing FSOS repository and design system.
3. Identify the existing route/navigation location intended for FSOS 360.
4. Identify reusable components, chart libraries, map capabilities, i18n conventions, and API clients already present.
5. Identify what data is currently available without changing backend/API/schema.
6. Build a complete implementation plan.
7. List any genuine specification-versus-code conflict.
8. Ask for confirmation only when a real conflict exists.
9. Otherwise begin implementation.

Do not start by redesigning the philosophy or copying the blueprint UI.

---

# 16. Incremental Delivery

Implement one logical milestone at a time.

Recommended milestones:

1. Route and unified page shell
2. Filter Workspace and shared analysis context
3. Executive Insight
4. KPI Summary and Performance Comparison
5. Timeline and Target visibility
6. Dynamic Visualization Workspace
7. Opportunities and Recommendations
8. Responsive and accessibility refinement
9. Final integration and validation

After each major milestone, report:
- what was completed;
- what remains;
- assumptions made;
- files changed;
- validation run.

Do not require approval after every normal milestone. Stop only for a genuine conflict or prohibited scope change.

---

# 17. Acceptance Criteria

The implementation is complete only when:

- the screen follows the approved FSOS 360 philosophy;
- the screen feels like one Executive Decision Workspace;
- default current-month versus previous-month comparison works;
- all interactions match the cascading filter model;
- invalid downstream selections are removed automatically;
- smart slicers work for large lists;
- multi-select works where applicable;
- all components use one analysis context;
- all components refresh together;
- Executive Insight remains near the top;
- every KPI includes comparison and business meaning;
- Target visibility follows the approved entity rules;
- Route and Sales Representative semantics remain distinct;
- the Visualization Workspace changes dynamically;
- the layout remains stable when visualization changes;
- Opportunities show only meaningful top opportunities;
- Recommendations use advisory, non-judgmental language;
- no duplicate information appears across components;
- no unrelated project files are modified;
- no backend/API/schema/architecture changes are introduced without approval;
- responsive behavior is production-ready;
- code follows existing FSOS conventions;
- typecheck and project validation pass.

---

# 18. Final Validation Checklist

Before declaring completion, verify:

- [ ] Philosophy respected
- [ ] Interaction behavior respected
- [ ] Component hierarchy respected
- [ ] Unified workspace context implemented
- [ ] Current and comparison periods implemented
- [ ] Cascading filters implemented
- [ ] Invalid downstream selections cleared
- [ ] Smart slicers implemented
- [ ] Multi-select implemented where applicable
- [ ] Executive Insight at the top
- [ ] KPI context and comparison included
- [ ] Target visibility correct
- [ ] Route vs Sales Representative distinction preserved
- [ ] Dynamic Visualization Workspace implemented
- [ ] Visualization container remains stable
- [ ] Advisory language respected
- [ ] No duplicated analytical content
- [ ] No unrelated files changed
- [ ] No backend changes introduced
- [ ] No API contract changes introduced
- [ ] No database schema changes introduced
- [ ] No architecture changes introduced
- [ ] Typecheck passes
- [ ] Production quality achieved

---

# 19. Initial Instruction to Codex

Use the following instruction after placing this file in the repository:

> Read `docs/FSOS_360_MASTER_SPEC_FOR_CODEX.md` completely before making any change.
>
> Then inspect the existing repository and report:
> 1. the exact existing files and reusable components relevant to FSOS 360;
> 2. the data and API capabilities currently available;
> 3. the proposed implementation milestones;
> 4. any genuine conflict between the specification and the current codebase.
>
> Do not write code in this first response.
> Do not modify Backend, API contracts, database schema, architecture, unrelated screens, or unrelated shared files.
> Ask only if a real conflict exists.

---

# 20. Final Product Rule

Do not optimize for visual beauty first.

Optimize for executive understanding and decision-making first.

Every UI element must answer:

**Does this help the executive understand the business and make a better decision?**

If not, simplify it or remove it.
