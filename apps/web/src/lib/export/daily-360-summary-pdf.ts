import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { VisitCopilot360Summary } from "@/lib/types";

// "تصدير PDF" (2026-07-28) — Arabic RTL PDF replica of the on-screen
// "ملخص اليوم 360°" report. Mirrors the exact html2canvas + jspdf pattern
// already established for Geo Intelligence Engine's Export PDF (see
// components/geo-engine/executive-tools.tsx) — dynamic-imported on click
// only, kept out of the SSR bundle, same as every other xlsx/pptx/pdf
// export in this app. Unlike that single-viewport capture, this report can
// be much taller than one page, so the captured canvas is sliced into
// multiple A4 pages here (still just one long screenshot, not real
// selectable PDF text — a deliberate, honest trade-off: the reference
// screenshots this feature must visually match are themselves images, and
// building a fully independent PDF text layout would risk drifting from
// the on-screen version, which the product requirement explicitly forbids
// — "نسخة … من نفس التقرير الظاهر").
//
// No new data: the PDF renders the exact DOM node the modal already built
// from the same VisitCopilot360Summary the user is looking at — same
// permissions, same hierarchy-scoped numbers, zero extra network calls.
export async function exportDaily360SummaryPdf(
  summary: VisitCopilot360Summary,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): Promise<void> {
  const root = document.getElementById("daily-360-summary-print-root");
  if (!root) throw new Error("daily-360-summary-print-root not found");

  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  // Capture only the scrollable report body, not the whole (viewport-
  // clipped) modal shell — otherwise we'd only ever get whatever fit on
  // screen. We temporarily clone the node's scroll height into view instead
  // of touching the live, still-interactive modal DOM.
  const scrollBody = root.querySelector<HTMLElement>(".min-h-0.flex-1.overflow-y-auto");
  const captureTarget = scrollBody ?? root;

  const canvas = await html2canvas(captureTarget, {
    useCORS: true,
    backgroundColor: "#ffffff",
    scale: 2,
    // Capture the full scrollable content, not just the visible clipped
    // viewport — html2canvas otherwise only rasterizes what's on screen.
    height: captureTarget.scrollHeight,
    windowHeight: captureTarget.scrollHeight,
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidthPt = pageWidth;

  // Slice the tall canvas into page-height chunks and add one jsPDF page per
  // chunk — a plain scaled single addImage would otherwise stretch/crop a
  // multi-page report onto a single A4 sheet.
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

  void t; // reserved for a future filename/localized-metadata pass

  pdf.save(`daily-360-summary-${summary.reportDate}.pdf`);
}
