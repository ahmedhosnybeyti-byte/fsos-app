"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/components/translation-provider";
import type { GeoPoint } from "@/lib/types";
import { colorHexChartSeries, SEMANTIC_COLORS, type ChartColorPoint } from "@/components/charts/chart-color-scale";

// Geo Intelligence Engine — Phase 3 chart. Top 10 points by value, straight
// off the same `result.points` the active map mode already renders — no
// second query, no new backend field. Clicking a bar fires the SAME
// `onPointClick` callback a map marker click does (see geo-engine/page.tsx),
// so a bar and a map marker for the same point cross-filter identically —
// one handler, two ways to trigger it, matching the client's Cross
// Filtering requirement ("selecting any geographic object" — a chart bar
// representing a customer/city point counts as one).
export function GeoChart({ points, selectedId, onPointClick }: { points: GeoPoint[]; selectedId: string | null; onPointClick: (point: GeoPoint) => void }) {
  const { t } = useTranslation();

  const top = useMemo(() => [...points].sort((a, b) => b.value - a.value).slice(0, 10), [points]);

  // Chart Color & Visual Intelligence Standard v1.0 — Geo Engine points have
  // no target concept (Cities/Territories/Customers are explicitly listed as
  // Relative Semantic Coloring examples in the spec), so this always resolves
  // to relative ranking within the currently-filtered Top-10 — never a fixed
  // hue, per chart-color-scale.ts's automatic strategy selection.
  const barColors = useMemo(() => colorHexChartSeries(top.map((p): ChartColorPoint => ({ value: p.value, target: null }))), [top]);

  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle>{t("geoEngine.chartTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("geoEngine.emptyResult")}</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" onClick={(e) => e?.activePayload?.[0] && onPointClick(e.activePayload[0].payload as GeoPoint)}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => Math.round(value).toLocaleString("en-US")} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {top.map((p, i) => (
                    <Cell
                      key={p.id}
                      cursor="pointer"
                      fill={barColors[i]}
                      stroke={p.id === selectedId ? SEMANTIC_COLORS.neutral : "none"}
                      strokeWidth={p.id === selectedId ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
