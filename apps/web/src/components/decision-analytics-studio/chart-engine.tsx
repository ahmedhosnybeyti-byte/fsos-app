"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Treemap,
  ScatterChart,
  Scatter,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DecisionAnalyzeByDimension, DecisionChartGroup } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { colorHexChartSeries, SEMANTIC_COLORS, type ChartColorPoint } from "@/components/charts/chart-color-scale";

// The switchable main chart — spec's chart-type row (Column, Bar, Line,
// Area, Stacked, Pie, Treemap, Scatter Plot, Pareto, Data Table). All 10
// types render the SAME `groups` prop (one DecisionQueryResult.chart array,
// already grouped server-side by the active Analyze-By dimension) — no
// separate request per chart type, matching the "one consistent joined
// dataset" architecture. Clicking any mark calls onGroupClick(group), which
// the page wires to the drill-down chain (Category -> Brand -> SKU ->
// Customer -> Invoice) AND to cross-filtering the mini heat map / KPI cards
// via the shared Global Analysis State — same click, two effects, per the
// client's explicit "charts must be linked to the heat map" requirement.

export type ChartType = "column" | "bar" | "line" | "area" | "stacked" | "pie" | "treemap" | "scatter" | "pareto" | "table";

const CHART_TYPES: { type: ChartType; labelKey: TranslationKey }[] = [
  { type: "column", labelKey: "decisionAnalyticsStudio.chartColumn" },
  { type: "bar", labelKey: "decisionAnalyticsStudio.chartBar" },
  { type: "line", labelKey: "decisionAnalyticsStudio.chartLine" },
  { type: "area", labelKey: "decisionAnalyticsStudio.chartArea" },
  { type: "stacked", labelKey: "decisionAnalyticsStudio.chartStacked" },
  { type: "pie", labelKey: "decisionAnalyticsStudio.chartPie" },
  { type: "treemap", labelKey: "decisionAnalyticsStudio.chartTreemap" },
  { type: "scatter", labelKey: "decisionAnalyticsStudio.chartScatter" },
  { type: "pareto", labelKey: "decisionAnalyticsStudio.chartPareto" },
  { type: "table", labelKey: "decisionAnalyticsStudio.chartTable" },
];

const DIMENSIONS: { dim: DecisionAnalyzeByDimension; labelKey: TranslationKey }[] = [
  { dim: "territory", labelKey: "decisionAnalyticsStudio.dimTerritory" },
  { dim: "channel", labelKey: "decisionAnalyticsStudio.dimChannel" },
  { dim: "category", labelKey: "decisionAnalyticsStudio.dimCategory" },
  { dim: "brand", labelKey: "decisionAnalyticsStudio.dimBrand" },
  { dim: "product", labelKey: "decisionAnalyticsStudio.dimProduct" },
  { dim: "customer", labelKey: "decisionAnalyticsStudio.dimCustomer" },
  { dim: "representative", labelKey: "decisionAnalyticsStudio.dimRepresentative" },
  { dim: "supervisor", labelKey: "decisionAnalyticsStudio.dimSupervisor" },
];

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// Custom Treemap tile renderer — recharts' `content` prop is typed as a
// ReactElement (it internally clones this element per node via
// React.cloneElement, injecting x/y/width/height/index/name/payload as
// props), NOT a render-prop function — passing an inline function compiles
// fine at runtime but fails `tsc` with a "no overload matches" error against
// recharts' own .d.ts. `colors` is our own extra prop, preserved through the
// clone alongside recharts' injected ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' cloned TreemapNode props (x/y/width/height/index/name) aren't exposed in its public types; same untyped-third-party-shape workaround as the onClick handler below.
function TreemapTileContent(props: any) {
  const { x, y, width, height, index, name, colors } = props;
  const fill = (colors as string[])[index] ?? SEMANTIC_COLORS.neutral;
  const showLabel = width > 60 && height > 24;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} />
      {showLabel ? (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11}>
          {name}
        </text>
      ) : null}
    </g>
  );
}

// Top-8-plus-Other grouping, used by Pie/Treemap so a high-cardinality
// dimension (e.g. hundreds of customers) doesn't render an unreadable chart.
// "Other" sums the real remaining values — not fabricated, just aggregated.
// "Other" itself carries no single target (it's a mix of many groups), so
// it always renders as "no data" gray on a target-based series, or gets
// ranked normally on a relative series — see chart-color-scale.ts.
function topNPlusOther(groups: DecisionChartGroup[], n: number, otherLabel: string): { key: string; label: string; sales: number; target: number | null }[] {
  const sorted = [...groups].sort((a, b) => b.sales - a.sales);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const restSum = rest.reduce((s, g) => s + g.sales, 0);
  const result = top.map((g) => ({ key: g.key, label: g.label, sales: g.sales, target: g.target }));
  if (restSum > 0) result.push({ key: "__other__", label: otherLabel, sales: restSum, target: null });
  return result;
}

export function ChartEngine({
  groups,
  analyzeBy,
  onAnalyzeByChange,
  onGroupClick,
  highlightedKey,
  canDrillDeeper,
}: {
  groups: DecisionChartGroup[];
  analyzeBy: DecisionAnalyzeByDimension;
  onAnalyzeByChange: (dim: DecisionAnalyzeByDimension) => void;
  onGroupClick: (group: DecisionChartGroup) => void;
  highlightedKey: string | null;
  canDrillDeeper: boolean;
}) {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState<ChartType>("column");

  // Sorted sales-desc for every chart family — server already sorts this
  // way, but re-sorting client-side keeps this component correct even if a
  // future caller passes an unsorted array.
  const sorted = useMemo(() => [...groups].sort((a, b) => b.sales - a.sales), [groups]);

  const paretoData = useMemo(() => {
    const total = sorted.reduce((s, g) => s + g.sales, 0);
    let cumulative = 0;
    return sorted.map((g) => {
      cumulative += g.sales;
      return { ...g, cumulativePct: total > 0 ? (cumulative / total) * 100 : 0 };
    });
  }, [sorted]);

  const pieData = useMemo(() => topNPlusOther(sorted, 8, t("decisionAnalyticsStudio.otherSlice")), [sorted, t]);

  // Chart Color & Visual Intelligence Standard v1.0 — one semantic color per
  // bar/slice/point, auto-selecting Target-Based vs Relative Semantic
  // Coloring per chart-color-scale.ts. `barColors`/`paretoColors` share the
  // same order as `sorted`/`paretoData` (paretoData is a direct map over
  // sorted, order preserved), so a single computed array serves Column, Bar,
  // Stacked, Scatter, and Pareto. `pieColors` is separate because Pie/
  // Treemap's Top-8-plus-Other grouping is a DIFFERENT set of items.
  const barColors = useMemo(() => colorHexChartSeries(sorted.map((g): ChartColorPoint => ({ value: g.sales, target: g.target }))), [sorted]);
  const pieColors = useMemo(() => colorHexChartSeries(pieData.map((d): ChartColorPoint => ({ value: d.sales, target: d.target }))), [pieData]);

  function handleBarClick(data: { key?: string }) {
    if (!data?.key || data.key === "__other__") return;
    const g = groups.find((x) => x.key === data.key);
    if (g) onGroupClick(g);
  }

  // Custom tooltip for Column/Bar — client asked for the Target number and
  // Achievement % to show next to the Sales number, not just be implied by
  // the bar's color. Reads the full DecisionChartGroup payload (not just the
  // plotted value) so it can add those two lines whenever this group
  // actually carries a target (representative/supervisor with uploaded
  // Targets data — see decision-analytics-studio.service.ts's
  // buildRepTargetTotals); silently omits them for every other
  // dimension/rep-without-target, same graceful fallback as the color engine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' TooltipProps generic doesn't line up cleanly with this file's payload shape; same untyped-third-party-shape workaround used elsewhere in this file.
  function renderGroupTooltip(props: any) {
    if (!props?.active || !props.payload?.length) return null;
    const g = props.payload[0].payload as DecisionChartGroup;
    const hasTarget = typeof g.target === "number" && g.target > 0;
    const achievementPct = hasTarget ? Math.round((g.sales / (g.target as number)) * 100) : null;
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="mb-1 font-medium text-popover-foreground">{g.label}</p>
        <p className="text-muted-foreground">
          {t("decisionAnalyticsStudio.kpiSales")}: {formatAmount(g.sales)}
        </p>
        {hasTarget && (
          <>
            <p className="text-muted-foreground">
              {t("decisionAnalyticsStudio.tooltipTarget")}: {formatAmount(g.target as number)}
            </p>
            <p className="text-muted-foreground">
              {t("decisionAnalyticsStudio.tooltipAchievement")}: {achievementPct}%
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="glass-card rise-in flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {DIMENSIONS.map((d) => (
            <Button key={d.dim} type="button" size="sm" variant={analyzeBy === d.dim ? "default" : "outline"} onClick={() => onAnalyzeByChange(d.dim)}>
              {t(d.labelKey)}
            </Button>
          ))}
        </div>
        {canDrillDeeper && <span className="text-xs text-muted-foreground">{t("decisionAnalyticsStudio.drillHint")}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {CHART_TYPES.map((c) => (
          <button
            key={c.type}
            type="button"
            onClick={() => setChartType(c.type)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              chartType === c.type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("decisionAnalyticsStudio.emptyResult")}</p>
      ) : (
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "column" ? (
              <BarChart data={sorted} onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <Tooltip content={renderGroupTooltip} />
                <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                  {sorted.map((g, i) => (
                    <Cell
                      key={g.key}
                      cursor="pointer"
                      fill={barColors[i]}
                      stroke={g.key === highlightedKey ? SEMANTIC_COLORS.neutral : "none"}
                      strokeWidth={g.key === highlightedKey ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : chartType === "bar" ? (
              <BarChart data={sorted} layout="vertical" onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis type="number" tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                <Tooltip content={renderGroupTooltip} />
                <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                  {sorted.map((g, i) => (
                    <Cell
                      key={g.key}
                      cursor="pointer"
                      fill={barColors[i]}
                      stroke={g.key === highlightedKey ? SEMANTIC_COLORS.neutral : "none"}
                      strokeWidth={g.key === highlightedKey ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : chartType === "line" ? (
              <LineChart data={sorted} onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatAmount(v)} />
                <Line type="monotone" dataKey="sales" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, cursor: "pointer" }} />
              </LineChart>
            ) : chartType === "area" ? (
              <AreaChart data={sorted} onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatAmount(v)} />
                <Area type="monotone" dataKey="sales" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} />
              </AreaChart>
            ) : chartType === "stacked" ? (
              // 100%-composition stacked bar: one bar, one segment per group,
              // each segment's real Sales value (not fabricated) — shows
              // each dimension value's share of total Sales in one glance.
              <BarChart
                data={[Object.fromEntries([["name", t("decisionAnalyticsStudio.chartStacked")], ...sorted.map((g) => [g.key, g.sales])])]}
                layout="vertical"
              >
                <XAxis type="number" tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={0} tick={false} />
                <Tooltip formatter={(v: number) => formatAmount(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {sorted.map((g, i) => (
                  <Bar key={g.key} dataKey={g.key} name={g.label} stackId="a" fill={barColors[i]} onClick={() => onGroupClick(g)} cursor="pointer" />
                ))}
              </BarChart>
            ) : chartType === "pie" ? (
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="sales"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={130}
                  label={(entry: { label?: string }) => entry.label ?? ""}
                  onClick={(entry: { key?: string }) => {
                    if (!entry?.key || entry.key === "__other__") return;
                    const g = groups.find((x) => x.key === entry.key);
                    if (g) onGroupClick(g);
                  }}
                >
                  {pieData.map((d, i) => (
                    <Cell key={d.key} cursor={d.key === "__other__" ? "default" : "pointer"} fill={pieColors[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatAmount(v)} />
              </PieChart>
            ) : chartType === "treemap" ? (
              <Treemap
                data={pieData}
                dataKey="sales"
                nameKey="label"
                stroke="#fff"
                // Rectangle color = business performance level, per the Chart
                // Color Standard's Treemap rule — replaces the single fixed
                // fill every tile used to share. recharts clones this element
                // per node and injects `index`, which lines up directly with
                // `pieData`/`pieColors`' shared order.
                content={<TreemapTileContent colors={pieColors} />}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' TreemapNode type doesn't expose the flattened dataKey fields (key/label/sales) it actually carries at runtime; same untyped-third-party-shape workaround as leaflet.heat's ambient declaration elsewhere in this codebase.
                onClick={(entry: any) => {
                  const key = entry?.key as string | undefined;
                  if (!key || key === "__other__") return;
                  const g = groups.find((x) => x.key === key);
                  if (g) onGroupClick(g);
                }}
              >
                <Tooltip formatter={(v: number) => formatAmount(v)} />
              </Treemap>
            ) : chartType === "scatter" ? (
              // Bivariate: Sales (x) vs Orders (y) per group — two genuinely
              // distinct, already-computed metrics, not a fabricated axis.
              <ScatterChart onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis type="number" dataKey="sales" name={t("decisionAnalyticsStudio.kpiSales")} tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <YAxis type="number" dataKey="ordersCount" name={t("decisionAnalyticsStudio.kpiOrders")} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatAmount(v)} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={sorted} cursor="pointer">
                  {sorted.map((g, i) => (
                    <Cell key={g.key} fill={barColors[i]} />
                  ))}
                </Scatter>
              </ScatterChart>
            ) : chartType === "pareto" ? (
              <ComposedChart data={paretoData} onClick={(e) => e?.activePayload?.[0] && handleBarClick(e.activePayload[0].payload)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis yAxisId="left" tickFormatter={formatAmount} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number, name: string) => (name === "cumulativePct" ? `${v.toFixed(1)}%` : formatAmount(v))} />
                <Bar yAxisId="left" dataKey="sales" cursor="pointer">
                  {paretoData.map((g, i) => (
                    <Cell key={g.key} fill={barColors[i]} />
                  ))}
                </Bar>
                {/* Cumulative line stays fixed Blue per the Chart Color
                    Standard's Pareto rule ("Cumulative line uses Blue") —
                    it's a running total, not a per-item performance value. */}
                <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke={SEMANTIC_COLORS.neutral} strokeWidth={2} dot={false} />
              </ComposedChart>
            ) : (
              <div />
            )}
          </ResponsiveContainer>
        </div>
      )}

      {chartType === "table" && <ChartGroupsTable groups={sorted} onRowClick={onGroupClick} highlightedKey={highlightedKey} />}
    </Card>
  );
}

// "Data Table" chart-type option — a compact table of the SAME chart-groups
// data (one row per Analyze-By value), distinct from the paginated
// Invoice-line Detail Table further down the page (that one is the final
// "Invoice" drill level; this is just another view of the current chart).
function ChartGroupsTable({
  groups,
  onRowClick,
  highlightedKey,
}: {
  groups: DecisionChartGroup[];
  onRowClick: (group: DecisionChartGroup) => void;
  highlightedKey: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start">{t("decisionAnalyticsStudio.tableColLabel")}</th>
            <th className="px-3 py-2 text-end">{t("decisionAnalyticsStudio.kpiSales")}</th>
            <th className="px-3 py-2 text-end">{t("decisionAnalyticsStudio.kpiGrowth")}</th>
            <th className="px-3 py-2 text-end">{t("decisionAnalyticsStudio.kpiOrders")}</th>
            <th className="px-3 py-2 text-end">{t("decisionAnalyticsStudio.kpiActiveCustomers")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr
              key={g.key}
              onClick={() => onRowClick(g)}
              className={cn("cursor-pointer border-t border-border hover:bg-secondary/30", g.key === highlightedKey && "bg-primary/10")}
            >
              <td className="px-3 py-2 font-medium">{g.label}</td>
              <td className="px-3 py-2 text-end">{formatAmount(g.sales)}</td>
              <td className="px-3 py-2 text-end">{g.salesPriorPct === null ? "—" : `${g.salesPriorPct >= 0 ? "+" : ""}${g.salesPriorPct.toFixed(1)}%`}</td>
              <td className="px-3 py-2 text-end">{g.ordersCount}</td>
              <td className="px-3 py-2 text-end">{g.activeCustomersCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
