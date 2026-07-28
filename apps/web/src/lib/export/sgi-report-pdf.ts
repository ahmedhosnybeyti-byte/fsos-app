import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { SgiLatestResult, SgiSituation, SgiSituationType } from "@/lib/types";
import { FILTERABLE_TYPES, TYPE_LABEL, formatMoney, opportunityMetric, sortWithinType } from "@/app/(dashboard)/dashboard/sales-growth/priority-tree";

// "مركز فرص النمو" — PDF export (2026-07-29, explicit product request).
//
// Deliberately NOT a screenshot of the on-screen interactive tree (unlike
// daily-360-summary-pdf.ts) — the live screen only ever shows whatever the
// current severity/type filter and collapsed/expanded state happen to be,
// while the requested PDF is a full, always-complete report (executive
// summary, target achievement, top opportunities per category, full
// priority-ranked list) meant to be shared with a rep/supervisor/manager.
// So this file builds its own dedicated, hidden, always-fully-expanded
// print layout from the exact same `SgiLatestResult` the screen already
// has in memory (no new fetch, no new backend call), then captures THAT
// with html2canvas + jsPDF — same capture/slice mechanics as
// daily-360-summary-pdf.ts, just a different DOM source.
//
// Zero new business logic: every number rendered here comes straight from
// opportunityMetric()/sortWithinType() (see priority-tree.tsx, imported
// not reimplemented) or directly from SgiLatestResult's own fields
// (summary.monthlyGoal, situations, repDirectory). Per explicit product
// constraint: Target Achievement is included ONLY if
// result.summary.monthlyGoal.targetTotal is already non-null in the data
// the screen already fetched — never computed locally, never a new call.
//
// Deferred opportunity types (average invoice, due-date collection,
// up-sell, geo-based) are NOT rendered as empty/placeholder sections —
// they're named once, in a single explicit "Deferred" note, exactly as
// instructed: "لا تعرض للمستخدم بطاقات فارغة وكأن الأنواع الجديدة موجودة".

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

const REPORT_INK = "#14304d";
const REPORT_MUTED_INK = "#3d6690";
const REPORT_CARD_BG = "#eef4fb";
const REPORT_CARD_BORDER = "#bcd4ec";
const REPORT_BADGE_BG = "#fff1e6";
const REPORT_BADGE_BORDER = "#f3b988";
const REPORT_BADGE_INK = "#9a4a12";
const PRINT_ROOT_ID = "sgi-report-print-root";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// One row per opportunity, mirroring SituationCard's 4-question content
// (why / what / action / expected impact) but always-expanded and printed,
// never collapsed — a PDF has no interactive state.
function buildSituationRow(s: SgiSituation, ownerLabel: string): HTMLDivElement {
  const row = el("div", "sgi-pdf-row");
  row.style.cssText = `border:1px solid ${REPORT_CARD_BORDER};border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#ffffff;`;

  const header = el("div", "");
  header.style.cssText = "display:flex;justify-content:space-between;gap:8px;align-items:baseline;";
  const title = el("p", "", s.title);
  title.style.cssText = `font-weight:600;font-size:13px;color:${REPORT_INK};margin:0;`;
  const badge = el("span", "", TYPE_LABEL[s.type]);
  badge.style.cssText = `font-size:10px;padding:2px 8px;border-radius:999px;background:${REPORT_BADGE_BG};border:1px solid ${REPORT_BADGE_BORDER};color:${REPORT_BADGE_INK};white-space:nowrap;`;
  header.appendChild(title);
  header.appendChild(badge);
  row.appendChild(header);

  const owner = el("p", "", ownerLabel);
  owner.style.cssText = `font-size:10px;color:${REPORT_MUTED_INK};margin:2px 0 6px;`;
  row.appendChild(owner);

  const detail = el("p", "", s.detail);
  detail.style.cssText = `font-size:11.5px;color:${REPORT_MUTED_INK};margin:0 0 4px;`;
  row.appendChild(detail);

  const rec = el("p", "", s.recommendation);
  rec.style.cssText = `font-size:11.5px;color:${REPORT_INK};margin:0 0 6px;`;
  row.appendChild(rec);

  const m = opportunityMetric(s);
  const metric = el("p", "");
  metric.style.cssText = `font-size:12px;font-weight:600;color:${REPORT_INK};margin:0;`;
  if (m.kind === "gap" || m.kind === "single") {
    metric.textContent = `${m.label}: ${formatMoney(m.value)}`;
  } else {
    metric.textContent = `${m.labelA}: ${formatMoney(m.valueA)}   ${m.labelB}: ${formatMoney(m.valueB)}`;
  }
  row.appendChild(metric);

  return row;
}

function buildSectionTitle(text: string): HTMLHeadingElement {
  const h = el("h2", "", text);
  h.style.cssText = `font-size:15px;font-weight:700;color:${REPORT_INK};margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid ${REPORT_CARD_BORDER};`;
  return h;
}

// Builds the full off-screen report DOM, appended to <body> (display:none
// is not usable with html2canvas — it renders nothing — so it's positioned
// far off-screen instead, same trick implicitly relied on by keeping the
// live report's own print-root always mounted).
function buildPrintRoot(result: SgiLatestResult, t: T): HTMLDivElement {
  const nameByEmail = new Map(result.repDirectory.map((d) => [d.email, d.name]));
  const ownerLabel = (s: SgiSituation) => (s.ownerRepEmail ? (nameByEmail.get(s.ownerRepEmail) ?? s.ownerRepEmail) : t("sgi.pdfNoOwnerLabel"));

  const root = el("div", "");
  root.id = PRINT_ROOT_ID;
  root.dir = "rtl";
  root.style.cssText =
    "position:fixed;top:0;left:-10000px;width:760px;background:#ffffff;padding:28px;font-family:inherit;box-sizing:border-box;";

  // Header
  const hero = el("div", "");
  hero.style.cssText = "background:linear-gradient(135deg, #ffb066, #2f7fd6);border-radius:10px;padding:18px 20px;color:#ffffff;margin-bottom:16px;";
  const heroTitle = el("h1", "", t("sgi.pdfReportTitle"));
  heroTitle.style.cssText = "font-size:19px;font-weight:700;margin:0 0 4px;";
  const heroDate = el("p", "", t("sgi.pdfGeneratedAtLabel") + ": " + new Date(result.generatedAt).toLocaleString("ar-EG"));
  heroDate.style.cssText = "font-size:11px;margin:0;opacity:0.9;";
  hero.appendChild(heroTitle);
  hero.appendChild(heroDate);
  root.appendChild(hero);

  // Executive summary
  root.appendChild(buildSectionTitle(t("sgi.pdfExecutiveSummaryTitle")));
  const summaryBox = el("div", "");
  summaryBox.style.cssText = `background:${REPORT_CARD_BG};border:1px solid ${REPORT_CARD_BORDER};border-radius:8px;padding:12px 14px;margin-bottom:8px;`;
  const briefing = el("p", "", result.briefing);
  briefing.style.cssText = `font-size:12px;color:${REPORT_INK};margin:0 0 10px;white-space:pre-wrap;`;
  summaryBox.appendChild(briefing);

  const statsRow = el("div", "");
  statsRow.style.cssText = "display:flex;gap:16px;";
  const totalStat = el("div", "");
  totalStat.innerHTML = `<div style="font-size:20px;font-weight:700;color:${REPORT_INK}">${result.summary.totalSituations}</div><div style="font-size:10px;color:${REPORT_MUTED_INK}">${t("sgi.pdfTotalOpportunitiesLabel")}</div>`;
  const highStat = el("div", "");
  highStat.innerHTML = `<div style="font-size:20px;font-weight:700;color:#b3401f">${result.summary.highSeverityCount}</div><div style="font-size:10px;color:${REPORT_MUTED_INK}">${t("sgi.pdfHighSeverityLabel")}</div>`;
  statsRow.appendChild(totalStat);
  statsRow.appendChild(highStat);
  summaryBox.appendChild(statsRow);
  root.appendChild(summaryBox);

  // Target Achievement — ONLY if already present in the data the screen
  // already fetched (result.summary.monthlyGoal.targetTotal !== null).
  // Never a new backend call, never computed locally.
  const goal = result.summary.monthlyGoal;
  if (goal.targetTotal !== null) {
    root.appendChild(buildSectionTitle(t("sgi.pdfTargetAchievementTitle")));
    const goalBox = el("div", "");
    goalBox.style.cssText = `background:${REPORT_CARD_BG};border:1px solid ${REPORT_CARD_BORDER};border-radius:8px;padding:12px 14px;margin-bottom:8px;`;
    const pct = goal.progressPct ?? 0;
    const goalText = el(
      "p",
      "",
      t("sgi.pdfTargetAchievedOf", { actual: formatMoney(goal.actualTotal), target: formatMoney(goal.targetTotal), pct }),
    );
    goalText.style.cssText = `font-size:12px;font-weight:600;color:${REPORT_INK};margin:0 0 8px;`;
    goalBox.appendChild(goalText);
    const barTrack = el("div", "");
    barTrack.style.cssText = "height:8px;width:100%;border-radius:999px;background:#dbe6f2;overflow:hidden;";
    const barFill = el("div", "");
    const barColor = pct >= 90 ? "#1f9d55" : pct >= 60 ? "#c98a12" : "#c0392b";
    barFill.style.cssText = `height:100%;border-radius:999px;background:${barColor};width:${Math.min(100, Math.max(0, pct))}%;`;
    barTrack.appendChild(barFill);
    goalBox.appendChild(barTrack);
    root.appendChild(goalBox);
  }
  // else: section fully hidden, per explicit constraint — no fabricated
  // target, no "N/A" placeholder implying a target exists.

  // Ranked situations (within-type only, per product constraint — see
  // sortWithinType's own doc comment in priority-tree.tsx).
  const ranked = sortWithinType(result.situations.filter((s) => (FILTERABLE_TYPES as SgiSituationType[]).includes(s.type)));
  const byType = new Map<SgiSituationType, SgiSituation[]>();
  for (const s of ranked) {
    const arr = byType.get(s.type) ?? [];
    arr.push(s);
    byType.set(s.type, arr);
  }

  // Top opportunities by category — top 3 per type that actually has data,
  // in FILTERABLE_TYPES order (the same fixed, code-defined order used
  // everywhere else in this feature, not a re-sort by arbitrary magnitude
  // across incompatible units).
  root.appendChild(buildSectionTitle(t("sgi.pdfTopByCategoryTitle")));
  for (const type of FILTERABLE_TYPES) {
    const items = byType.get(type);
    if (!items || items.length === 0) continue;
    const typeHeader = el("h3", "", `${TYPE_LABEL[type]} (${items.length})`);
    typeHeader.style.cssText = `font-size:12.5px;font-weight:700;color:${REPORT_INK};margin:10px 0 6px;`;
    root.appendChild(typeHeader);
    for (const s of items.slice(0, 3)) {
      root.appendChild(buildSituationRow(s, ownerLabel(s)));
    }
  }

  // Deferred types — a single explicit note, never empty per-type sections.
  root.appendChild(buildSectionTitle(t("sgi.pdfDeferredTitle")));
  const deferredNote = el("p", "", t("sgi.pdfDeferredNote"));
  deferredNote.style.cssText = `font-size:11px;color:${REPORT_MUTED_INK};background:${REPORT_CARD_BG};border:1px solid ${REPORT_CARD_BORDER};border-radius:8px;padding:10px 12px;margin:0;`;
  root.appendChild(deferredNote);

  // Full priority-ranked list — every situation, not just the top 3 per
  // category above (per explicit "no cap on customer count" constraint).
  root.appendChild(buildSectionTitle(t("sgi.pdfFullListTitle")));
  for (const s of ranked) {
    root.appendChild(buildSituationRow(s, ownerLabel(s)));
  }

  document.body.appendChild(root);
  return root;
}

export async function exportSgiReportPdf(result: SgiLatestResult, t: T): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const root = buildPrintRoot(result, t);
  try {
    const canvas = await html2canvas(root, {
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: 2,
      height: root.scrollHeight,
      windowHeight: root.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidthPt = pageWidth;
    const pageHeightPx = (pageHeight * canvas.width) / imgWidthPt;

    let renderedHeightPx = 0;
    let pageIndex = 0;
    while (renderedHeightPx < canvas.height) {
      const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedHeightPx);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(canvas, 0, renderedHeightPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      if (pageIndex > 0) pdf.addPage();
      const sliceHeightPt = (sliceHeightPx * imgWidthPt) / canvas.width;
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, imgWidthPt, sliceHeightPt);

      renderedHeightPx += sliceHeightPx;
      pageIndex += 1;
    }

    pdf.save(`sgi-growth-opportunities-${result.periodMonth}.pdf`);
  } finally {
    root.remove();
  }
}
