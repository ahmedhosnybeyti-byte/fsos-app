// Reports feature (Task #253/#254, explicit product request — "الزغلول
// الكبير"): a branded, professional PowerPoint export of Sales Growth
// Intelligence data, generated client-side so a SUPERVISOR/MANAGER/
// COMPANY_ADMIN can open a real .pptx in a meeting instead of just an Excel
// export. Same dynamic-import-on-click pattern already used for the Excel
// exports elsewhere in the app (team-performance/page.tsx,
// heatmap/page.tsx) — pptxgenjs never enters the SSR bundle.
//
// pptxgenjs's own nested TypeScript type exports (e.g. a "Slide" type) vary
// across versions and can't be verified in this sandbox (no working
// pnpm/tsc here — see PROJECT_LOG for that constraint). To avoid depending
// on a guessed type name that might not exist in the installed version,
// every pptxgenjs-facing type below is derived STRUCTURALLY from the
// actual dynamic import (`Awaited<ReturnType<...>>`) instead of imported
// by name — this compiles against whatever version is actually installed,
// no guessing required.
async function createPresentation() {
  const PptxGenJS = (await import("pptxgenjs")).default;
  return new PptxGenJS();
}
type PptxPresentation = Awaited<ReturnType<typeof createPresentation>>;
type PptxSlide = ReturnType<PptxPresentation["addSlide"]>;

import type { SgiSeverity, SgiSituation, SgiSituationType } from "@/lib/types";

export interface SgiReportSection {
  type: SgiSituationType;
  label: string;
  // Already filtered to the chosen reps, sorted high->low severity, and
  // capped to the wizard's "max per type" choice by the caller — this
  // module only lays out whatever it's handed, it doesn't select/limit.
  situations: SgiSituation[];
}

// "360 درجة" section (Task #261, explicit product request): one row per
// rep in the wizard's chosen scope, real KPI numbers (not situation-derived
// counts) — the answer to "give me a full picture of exactly who I picked
// in step 1", same idea as this app's existing "Customer 360" pattern
// applied to reps instead of customers.
export interface SgiReport360Row {
  name: string;
  salesActual: number;
  salesTarget: number | null;
  collectionActual: number;
  activeCustomers: number;
  topProductName: string | null;
}

export interface SgiReportInput {
  companyName: string;
  scopeLabel: string;
  periodLabel: string;
  generatedByName: string;
  generatedDateLabel: string;
  monthlyGoal: { targetTotal: number | null; actualTotal: number; progressPct: number | null };
  totalSituations: number;
  severityCounts: Record<SgiSeverity, number>;
  sections: SgiReportSection[];
  // Omitted or empty -> no 360 slide(s) generated at all (the wizard's
  // "360 درجة" toggle controls this).
  rep360?: SgiReport360Row[];
}

// Professional navy/teal palette — deliberately NOT copied 1:1 from the
// app's own HSL severity tokens (--destructive/--warning/--success in
// globals.css) since PowerPoint needs flat hex and those are themed
// HSL triples; these are the closest solid-color equivalents so a slide's
// severity color still reads as "the same red/amber/green" as the
// Priority Center screen it came from.
const NAVY_DARK = "0F172A";
const NAVY = "1E293B";
const SLATE_500 = "64748B";
const SLATE_200 = "E2E8F0";
const WHITE = "FFFFFF";
const TEAL = "0D9488";
const SEVERITY_COLOR: Record<SgiSeverity, string> = { high: "DC2626", medium: "D97706", low: "16A34A" };
const SEVERITY_LABEL_AR: Record<SgiSeverity, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
// LAYOUT_WIDE's exact slide width (inches) — used instead of a "100%"
// shape width, since percentage-string dimensions for addShape aren't
// something this sandbox can confirm are supported by the installed
// pptxgenjs version (no working tsc/render here to check against).
const SLIDE_W = 13.33;

function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trimEnd()}…` : text;
}

// Footer branding + a thin top accent bar — called on every slide (cover
// included) so "Powered by Field Sales OS" is never missing, per explicit
// request. Kept as a plain per-slide call rather than a pptxgenjs slide
// master: master `objects` array item shapes are another part of the API
// surface that's easy to get subtly wrong without being able to render and
// check, so this simpler direct-call version is the safer bet.
function addChrome(pres: PptxPresentation, slide: PptxSlide, opts: { dark?: boolean } = {}) {
  if (!opts.dark) {
    // "rect" passed as a raw string literal, not `pres.shapes.RECTANGLE`/
    // `pres.ShapeType.rect` — confirmed against the installed pptxgenjs
    // 3.12.0 .d.ts (2026-07-21 production-build failure): the instance only
    // exposes `ShapeType` (not `shapes`, which is a namespace-only export),
    // and `addShape`'s parameter type (`SHAPE_NAME`) is a plain string
    // literal union — a string enum member isn't structurally assignable to
    // it, only the literal itself is guaranteed to typecheck.
    slide.addShape("rect", { x: 0, y: 0, w: SLIDE_W, h: 0.09, fill: { color: NAVY_DARK }, line: { color: NAVY_DARK, width: 0 } });
  }
  slide.addText("Powered by Field Sales OS", {
    x: 0.5,
    y: 7.08,
    w: 5,
    h: 0.3,
    fontSize: 9,
    color: opts.dark ? "94A3B8" : SLATE_500,
    align: "left",
    fontFace: "Arial",
    margin: 0,
  });
}

function addCoverSlide(pres: PptxPresentation, input: SgiReportInput) {
  const slide = pres.addSlide();
  slide.background = { color: NAVY_DARK };

  slide.addShape("rect", { x: 0, y: 3.55, w: SLIDE_W, h: 0.03, fill: { color: TEAL }, line: { color: TEAL, width: 0 } });

  slide.addText(input.companyName, {
    x: 0.8,
    y: 2.3,
    w: 11.7,
    h: 0.5,
    fontSize: 16,
    color: "94A3B8",
    align: "right",
    fontFace: "Arial",
    bold: true,
  });
  slide.addText("تقرير نمو المبيعات", {
    x: 0.8,
    y: 2.75,
    w: 11.7,
    h: 0.9,
    fontSize: 40,
    color: WHITE,
    align: "right",
    fontFace: "Arial",
    bold: true,
  });
  slide.addText(`${input.scopeLabel}  —  ${input.periodLabel}`, {
    x: 0.8,
    y: 3.75,
    w: 11.7,
    h: 0.5,
    fontSize: 18,
    color: "CBD5E1",
    align: "right",
    fontFace: "Arial",
  });
  slide.addText(`أُعِد بواسطة ${input.generatedByName} — ${input.generatedDateLabel}`, {
    x: 0.8,
    y: 4.35,
    w: 11.7,
    h: 0.4,
    fontSize: 12,
    color: "64748B",
    align: "right",
    fontFace: "Arial",
  });

  addChrome(pres, slide, { dark: true });
}

function addSummarySlide(pres: PptxPresentation, input: SgiReportInput) {
  const slide = pres.addSlide();
  slide.background = { color: WHITE };

  slide.addText("نظرة عامة", {
    x: 0.5,
    y: 0.35,
    w: 12.3,
    h: 0.6,
    fontSize: 26,
    color: NAVY_DARK,
    align: "right",
    fontFace: "Arial",
    bold: true,
    margin: 0,
  });

  // Big stat callouts row: total situations + rep/customer count context.
  slide.addText(
    [
      { text: fmtNumber(input.totalSituations), options: { fontSize: 34, bold: true, color: NAVY_DARK, breakLine: true } },
      { text: "إجمالي الحالات المشمولة بالتقرير", options: { fontSize: 12, color: SLATE_500 } },
    ],
    { x: 0.5, y: 1.15, w: 3.6, h: 1.3, align: "right", fontFace: "Arial", margin: 0 },
  );

  // Target progress donut (left half) — skipped gracefully when no target
  // is configured for this scope, same "no target" concept already shown
  // on the Sales Growth screen's monthly-goal card.
  if (input.monthlyGoal.targetTotal !== null && input.monthlyGoal.progressPct !== null) {
    const pct = Math.max(0, Math.min(100, input.monthlyGoal.progressPct));
    // "doughnut"/"pie" below as raw string literals, same reasoning as the
    // "rect" shape-name fix above — `addChart`'s `type` param (`CHART_NAME`)
    // is a plain string literal union, and `pres.charts` isn't an instance
    // property at all (it's a namespace-only export in the installed
    // pptxgenjs 3.12.0 types; the instance only exposes `ChartType`).
    slide.addChart(
      "doughnut",
      [{ name: "الهدف الشهري", labels: ["محقق", "المتبقي"], values: [pct, Math.max(0, 100 - pct)] }],
      {
        x: 0.5,
        y: 2.6,
        w: 4.2,
        h: 3.6,
        chartColors: [TEAL, SLATE_200],
        showLegend: false,
        showTitle: false,
        dataBorder: { pt: 2, color: WHITE },
        holeSize: 65,
      },
    );
    // Centered inside the donut's hole (chart box vertical center: 2.6 +
    // 3.6/2 = 4.4) — kept clear of the labels below, which sit fully
    // outside the chart's own bounding box (chart bottom edge = 6.2).
    slide.addText(`${Math.round(input.monthlyGoal.progressPct)}%`, {
      x: 0.5,
      y: 4.05,
      w: 4.2,
      h: 0.7,
      fontSize: 30,
      bold: true,
      color: NAVY_DARK,
      align: "center",
      fontFace: "Arial",
    });
    slide.addText(`${fmtNumber(input.monthlyGoal.actualTotal)} من ${fmtNumber(input.monthlyGoal.targetTotal)}`, {
      x: 0.5,
      y: 6.3,
      w: 4.2,
      h: 0.35,
      fontSize: 12,
      color: NAVY,
      align: "center",
      fontFace: "Arial",
      bold: true,
    });
    slide.addText("نسبة تحقيق الهدف الشهري", { x: 0.5, y: 6.65, w: 4.2, h: 0.3, fontSize: 11, color: SLATE_500, align: "center", fontFace: "Arial" });
  } else {
    slide.addText("لا يوجد هدف شهري محدد لهذا النطاق", {
      x: 0.5,
      y: 3.8,
      w: 4.2,
      h: 1,
      fontSize: 13,
      color: SLATE_500,
      align: "center",
      fontFace: "Arial",
      valign: "middle",
    });
  }

  // Severity breakdown (right half) — accurate for whatever rep subset the
  // wizard's scope step selected, unlike the target donut above which
  // reflects the viewer's own natural SGI scope (see reports/page.tsx for
  // why those two can differ).
  const sevEntries = (["high", "medium", "low"] as const).filter((s) => input.severityCounts[s] > 0);
  if (sevEntries.length > 0) {
    slide.addChart(
      "pie",
      [{ name: "الحالات حسب الخطورة", labels: sevEntries.map((s) => SEVERITY_LABEL_AR[s]), values: sevEntries.map((s) => input.severityCounts[s]) }],
      {
        x: 5.2,
        y: 1.15,
        w: 7.6,
        h: 4.6,
        chartColors: sevEntries.map((s) => SEVERITY_COLOR[s]),
        showLegend: true,
        legendPos: "r",
        showPercent: true,
        showTitle: true,
        title: "الحالات حسب درجة الخطورة",
        chartArea: { fill: { color: WHITE } },
      },
    );
  }

  addChrome(pres, slide);
}

// "360 درجة" — one table row per rep in the wizard's chosen scope, real
// KPI numbers rather than situation-derived counts. Manually paginated
// (fixed-size chunks, one slide per chunk) instead of relying on
// pptxgenjs's `autoPage` table option — that option's exact behavior can't
// be verified in this sandbox (no render/tsc access), so a predictable
// manual split is the safer bet for a first version.
const REP_360_ROWS_PER_SLIDE = 12;

function addRep360Slides(pres: PptxPresentation, rows: SgiReport360Row[]) {
  const pages: SgiReport360Row[][] = [];
  for (let i = 0; i < rows.length; i += REP_360_ROWS_PER_SLIDE) pages.push(rows.slice(i, i + REP_360_ROWS_PER_SLIDE));

  pages.forEach((pageRows, pageIndex) => {
    const slide = pres.addSlide();
    slide.background = { color: WHITE };

    const title = pages.length > 1 ? `360 درجة (${pageIndex + 1}/${pages.length})` : "360 درجة";
    slide.addText(title, {
      x: 0.5,
      y: 0.35,
      w: 12.3,
      h: 0.55,
      fontSize: 24,
      color: NAVY_DARK,
      align: "right",
      fontFace: "Arial",
      bold: true,
      margin: 0,
    });

    const headerRow = ["المندوب", "المبيعات الفعلية", "الهدف", "التحصيل", "العملاء النشطين", "أهم صنف"].map((text) => ({
      text,
      options: { bold: true, color: WHITE, fill: { color: NAVY_DARK }, align: "center" as const, fontFace: "Arial", fontSize: 11 },
    }));
    const dataRows = pageRows.map((r) => [
      { text: r.name, options: { align: "right" as const, fontFace: "Arial", fontSize: 10.5, bold: true } },
      { text: fmtNumber(r.salesActual), options: { align: "center" as const, fontFace: "Arial", fontSize: 10.5 } },
      { text: r.salesTarget !== null ? fmtNumber(r.salesTarget) : "—", options: { align: "center" as const, fontFace: "Arial", fontSize: 10.5 } },
      { text: fmtNumber(r.collectionActual), options: { align: "center" as const, fontFace: "Arial", fontSize: 10.5 } },
      { text: String(r.activeCustomers), options: { align: "center" as const, fontFace: "Arial", fontSize: 10.5 } },
      { text: r.topProductName ? truncate(r.topProductName, 22) : "—", options: { align: "right" as const, fontFace: "Arial", fontSize: 10.5 } },
    ]);

    slide.addTable([headerRow, ...dataRows], {
      x: 0.5,
      y: 1.15,
      w: 12.3,
      colW: [2.9, 2.0, 1.8, 2.0, 1.6, 2.0],
      border: { pt: 0.5, color: SLATE_200 },
    });

    addChrome(pres, slide);
  });
}

function addSituationTypeSlide(pres: PptxPresentation, section: SgiReportSection) {
  const slide = pres.addSlide();
  slide.background = { color: WHITE };

  slide.addText(section.label, {
    x: 0.5,
    y: 0.35,
    w: 10,
    h: 0.55,
    fontSize: 24,
    color: NAVY_DARK,
    align: "right",
    fontFace: "Arial",
    bold: true,
    margin: 0,
  });
  slide.addText(`${section.situations.length} حالة`, {
    x: 10.5,
    y: 0.4,
    w: 2.3,
    h: 0.45,
    fontSize: 13,
    color: SLATE_500,
    align: "left",
    fontFace: "Arial",
  });

  const top = 1.15;
  const bottom = 6.95;
  const count = section.situations.length;
  const gap = 0.12;
  const cardH = (bottom - top - gap * (count - 1)) / count;
  const accentW = 0.07;
  const cardX = 0.5;
  const cardW = 12.3;

  section.situations.forEach((s, i) => {
    const y = top + i * (cardH + gap);
    // Accent bar sits on the RIGHT edge of the card, matching the reading
    // direction (RTL) — see sgi-report-pptx.ts pitfall notes: RECTANGLE
    // (not ROUNDED_RECTANGLE) so a thin accent overlay actually covers
    // flush against the card's corner instead of poking past a rounded one.
    slide.addShape("rect", {
      x: cardX + cardW - accentW,
      y,
      w: accentW,
      h: cardH,
      fill: { color: SEVERITY_COLOR[s.severity] },
      line: { color: SEVERITY_COLOR[s.severity], width: 0 },
    });
    slide.addText(
      [
        { text: `${s.entityLabel} — ${s.title}`, options: { bold: true, fontSize: 13, color: NAVY_DARK, breakLine: true } },
        { text: truncate(s.detail, 150), options: { fontSize: 10.5, color: SLATE_500, breakLine: true } },
        { text: `التوصية: ${truncate(s.recommendation, 120)}`, options: { fontSize: 10.5, italic: true, color: TEAL } },
      ],
      { x: cardX, y, w: cardW - accentW - 0.15, h: cardH, align: "right", fontFace: "Arial", valign: "top", margin: 2 },
    );
  });

  addChrome(pres, slide);
}

function addClosingSlide(pres: PptxPresentation, input: SgiReportInput) {
  const slide = pres.addSlide();
  slide.background = { color: NAVY_DARK };

  slide.addText("الخطوات التالية", {
    x: 0.8,
    y: 1.2,
    w: 11.7,
    h: 0.7,
    fontSize: 30,
    color: WHITE,
    align: "right",
    fontFace: "Arial",
    bold: true,
  });

  // Top 1 recommendation per included type (highest severity first, since
  // caller already sorts each section that way) — a short "what to actually
  // do in this meeting" recap rather than repeating every card.
  const bullets = input.sections
    .filter((s) => s.situations.length > 0)
    .map((s) => {
      const top1 = s.situations[0]!;
      return { text: `${truncate(top1.recommendation, 130)}`, options: { bullet: true, breakLine: true, fontSize: 14, color: "E2E8F0" } };
    });

  if (bullets.length > 0) {
    slide.addText(bullets, { x: 0.8, y: 2.2, w: 11.7, h: 4, align: "right", fontFace: "Arial", paraSpaceAfter: 10 });
  }

  addChrome(pres, slide, { dark: true });
}

export async function generateSgiReportPptx(input: SgiReportInput): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = input.generatedByName || "Field Sales OS";
  pres.title = `تقرير نمو المبيعات — ${input.scopeLabel}`;
  // Documented pptxgenjs presentation-level flag enabling RTL paragraph
  // defaults for Arabic/Hebrew decks. Cast rather than a plain assignment
  // since this sandbox can't confirm whether the installed version's own
  // .d.ts declares it (same "can't verify types by running tsc" constraint
  // noted at the top of this file) — this way the assignment compiles
  // either way without depending on a guess.
  (pres as unknown as { rtlMode?: boolean }).rtlMode = true;

  addCoverSlide(pres, input);
  addSummarySlide(pres, input);
  if (input.rep360 && input.rep360.length > 0) addRep360Slides(pres, input.rep360);
  for (const section of input.sections) {
    if (section.situations.length === 0) continue;
    addSituationTypeSlide(pres, section);
  }
  addClosingSlide(pres, input);

  const safeScope = input.scopeLabel.replace(/[\\/:*?"<>|]/g, "").trim() || "تقرير";
  await pres.writeFile({ fileName: `تقرير-نمو-المبيعات-${safeScope}.pptx` });
}
