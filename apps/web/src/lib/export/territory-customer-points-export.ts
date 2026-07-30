import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { TerritoryCustomerMetric, TerritoryCustomerPointsResult } from "@/lib/types";
import type { TerritoryPointMapMode } from "@/components/territory-intelligence/territory-point-map";

// Territory Intelligence's 3 export buttons (2026-07-30, explicit product
// request — activate the 2 existing QuickTools buttons, "PPT" and "صورة",
// plus add one CSV/tabular export since the underlying data is a customer
// list; no new buttons beyond that one addition). All 3 build from the
// CURRENT screen state handed in by the caller (page.tsx) — never a fresh
// company-wide fetch — so a manager scoped to "الدمام" with "قيمة الفرصة"
// selected gets exactly that in the file, never the whole company.

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface TerritoryExportContext {
  scopeLabel: string; // city name, or "كل الأقاليم"/"All Territories"
  metric: TerritoryCustomerMetric;
  metricLabel: string; // already-translated label, e.g. t(METRIC_LABEL_KEY[metric])
  mapType: TerritoryPointMapMode;
  mapTypeLabel: string;
  result: TerritoryCustomerPointsResult; // the exact data currently on screen
  generatedAt: Date;
}

function metricValueLabel(rawValue: number | null, t: T): string {
  return rawValue === null ? t("territoryIntelligence.metricNoData") : Math.round(rawValue).toLocaleString("en-US");
}

// CSV — zero dependency, always works, matches the acceptance criteria's
// "عدد العملاء / عدد المواقع الفريدة / عدد الإحداثيات المستبعدة" header
// block plus one row per customer point currently on screen.
export function exportTerritoryCustomerPointsCsv(ctx: TerritoryExportContext, t: T): void {
  const { scopeLabel, metricLabel, mapTypeLabel, result, generatedAt } = ctx;
  const uniqueLocations = new Set(result.points.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`)).size;

  const lines: string[] = [];
  lines.push(`"${t("territoryIntelligence.title")}"`);
  lines.push(`"${scopeLabel}","${metricLabel}","${mapTypeLabel}","${generatedAt.toISOString()}"`);
  lines.push(`"${t("territoryIntelligence.exportTotalCustomers")}",${result.totalCustomers}`);
  lines.push(`"${t("territoryIntelligence.exportUniqueLocations")}",${uniqueLocations}`);
  lines.push(`"${t("territoryIntelligence.exportExcludedCoordinates")}",${result.excludedBadCoordinates}`);
  lines.push("");
  lines.push(["customerId", "customerName", "latitude", "longitude", "rawValue", "normalizedValue", "status"].join(","));
  for (const p of result.points) {
    lines.push(
      [
        JSON.stringify(p.customerId),
        JSON.stringify(p.customerName),
        p.latitude,
        p.longitude,
        p.rawValue ?? "",
        p.normalizedValue.toFixed(4),
        p.status,
      ].join(","),
    );
  }

  const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `territory-intelligence-${ctx.scopeLabel.replace(/\s+/g, "-")}-${ctx.metric}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// PNG snapshot of the currently-rendered Leaflet map container — captures
// exactly what's on screen (current mode/metric/colors), not a
// regenerated report. html2canvas is already a dependency (see
// sgi-report-pdf.ts / daily-360-summary-pdf.ts for the same pattern).
export async function exportTerritoryMapImage(mapContainer: HTMLElement, ctx: TerritoryExportContext): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(mapContainer, { useCORS: true, backgroundColor: "#ffffff", scale: 2 });
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `territory-intelligence-map-${ctx.scopeLabel.replace(/\s+/g, "-")}-${ctx.metric}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// PPT — one summary slide (scope/metric/map type/counts) matching the
// acceptance criteria's field list, using pptxgenjs the same way
// sgi-report-pptx.ts already does elsewhere in this app.
export async function exportTerritoryCustomerPointsPptx(ctx: TerritoryExportContext, t: T): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const { scopeLabel, metricLabel, mapTypeLabel, result, generatedAt } = ctx;
  const uniqueLocations = new Set(result.points.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`)).size;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "TI", width: 10, height: 5.63 });
  pptx.layout = "TI";
  const slide = pptx.addSlide();
  slide.addText(t("territoryIntelligence.title"), { x: 0.4, y: 0.3, w: 9.2, fontSize: 22, bold: true, color: "14304D" });
  slide.addText(`${scopeLabel} — ${metricLabel} — ${mapTypeLabel}`, { x: 0.4, y: 0.85, w: 9.2, fontSize: 13, color: "3D6690" });

  const rows: [string, string][] = [
    [t("territoryIntelligence.exportTotalCustomers"), String(result.totalCustomers)],
    [t("territoryIntelligence.exportUniqueLocations"), String(uniqueLocations)],
    [t("territoryIntelligence.exportExcludedCoordinates"), String(result.excludedBadCoordinates)],
  ];
  slide.addTable(
    rows.map(([label, value]) => [{ text: label, options: { bold: true } }, { text: value }]),
    { x: 0.4, y: 1.4, w: 6, fontSize: 13, border: { type: "solid", color: "BCD4EC", pt: 1 } },
  );

  // Top 12 points by |rawValue|, worst/most-notable first — same "manager's
  // eye goes to the extreme first" convention as getSummary()'s own
  // worst-first sort, applied here to whichever metric is active.
  const sortedPoints = [...result.points].sort((a, b) => Math.abs(b.rawValue ?? 0) - Math.abs(a.rawValue ?? 0)).slice(0, 12);
  const tableRows: Array<Array<{ text: string; options?: Record<string, unknown> }>> = [
    [{ text: t("territoryIntelligence.customersCountSuffix"), options: { bold: true } }, { text: metricLabel, options: { bold: true } }],
    ...sortedPoints.map((p) => [{ text: p.customerName }, { text: metricValueLabel(p.rawValue, t) }]),
  ];
  slide.addTable(tableRows, { x: 0.4, y: 2.9, w: 9.2, fontSize: 10, border: { type: "solid", color: "BCD4EC", pt: 1 } });

  slide.addText(generatedAt.toLocaleString("ar-EG"), { x: 0.4, y: 5.3, w: 9.2, fontSize: 8, color: "9AA5B1" });

  await pptx.writeFile({ fileName: `territory-intelligence-${scopeLabel.replace(/\s+/g, "-")}-${ctx.metric}.pptx` });
}
