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
  // screen. Selector kept in lockstep with the modal's own body div
  // className (see daily-360-summary-modal.tsx) — it drifted out of sync
  // once (still said "flex-1" after the modal moved to a CSS grid layout),
  // which silently fell back to capturing the whole root including the
  // header. Falls back to `root` only if the selector ever mismatches
  // again, so this never hard-fails just because of a className rename.
  const scrollBody = root.querySelector<HTMLElement>(".min-h-0.overflow-y-auto");
  const captureTarget = scrollBody ?? root;
  console.info("[daily-360-summary] PDF export: captureTarget=", captureTarget === root ? "root (fallback)" : "scrollBody", "scrollHeight=", captureTarget.scrollHeight);

  // html2canvas (v1.4.1) parses every CSS rule itself rather than asking the
  // browser to resolve it, and doesn't understand modern color syntax like
  // `color-mix(...)` (used by .crystal-badge's box-shadow — see
  // globals.css). Left alone this throws "Attempting to parse an
  // unsupported color function 'color'" and aborts the whole capture before
  // a single pixel is drawn (confirmed via Console during 2026-07-29
  // debugging — every attempt failed at exactly this point, never a canvas
  // size mismatch or a jsPDF issue). Fix is scoped to the export path only:
  // temporarily swap each affected element's inline box-shadow to a
  // plain rgba() equivalent (same visual ring, but a syntax html2canvas can
  // parse), capture, then restore the original inline style so the live
  // on-screen design is untouched.
  const colorMixNodes = Array.from(captureTarget.querySelectorAll<HTMLElement>(".crystal-badge"));
  const restoreBoxShadow: Array<() => void> = [];
  for (const node of colorMixNodes) {
    const prevInline = node.style.boxShadow;
    node.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.35)";
    restoreBoxShadow.push(() => {
      node.style.boxShadow = prevInline;
    });
  }

  // 2026-07-29 (explicit feedback after the first successful export): the
  // live "Crystal AI" glass surfaces (.glass-card, secondary Badge pills,
  // bg-background/60 sub-boxes) are theme-aware — translucent dark glass
  // with light text in the app's dark theme. html2canvas captures against
  // a forced white page background, which flattens that translucency into
  // solid dark-gray boxes while the text stays light, so large parts of
  // the PDF became illegible ("النص غاطس"). Product decision: not a color
  // bug to patch defensively — the PDF gets its own deliberate palette, a
  // warm-orange / cool-blue high-contrast identity distinct from the live
  // in-app theme ("ألوان مبهرة وذات وقار … البرتقالي مع الأزرق الثلجي").
  //
  // Applied by walking the DOM and setting inline styles directly (same
  // restore-after pattern as the crystal-badge fix above) rather than a
  // class-selector stylesheet — Tailwind's generated class order/escaping
  // isn't a stable target to select against, and html2canvas resolves
  // computed style per element anyway, so inline styles are both simpler
  // and more reliable here. Every group below is reverted in `finally`.
  const pdfColorRestores: Array<() => void> = [];
  function paintForExport(el: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
    const prev: Partial<CSSStyleDeclaration> = {};
    for (const key of Object.keys(styles) as Array<keyof CSSStyleDeclaration>) {
      (prev as Record<string, string>)[key as string] = el.style[key] as string;
      (el.style as unknown as Record<string, string>)[key as string] = styles[key] as string;
    }
    pdfColorRestores.push(() => {
      for (const key of Object.keys(prev) as Array<keyof CSSStyleDeclaration>) {
        (el.style as unknown as Record<string, string>)[key as string] = prev[key] as string;
      }
    });
  }

  const PDF_INK = "#14304d"; // primary text — deep navy, strong contrast on white
  const PDF_MUTED_INK = "#3d6690"; // secondary/meta text — cool blue, still easily readable
  const PDF_CARD_BG = "#eef4fb"; // section cards — pale ice-blue instead of translucent dark glass
  const PDF_CARD_BORDER = "#bcd4ec";
  const PDF_SUBBOX_BORDER = "#dbe6f2";
  const PDF_BADGE_BG = "#fff1e6"; // pill badges — warm pale orange
  const PDF_BADGE_BORDER = "#f3b988";
  const PDF_BADGE_INK = "#9a4a12";

  // Header hero — the one deliberately bold moment: a warm-orange to
  // cool-blue diagonal gradient with white text, "مبهر وذو وقار" instead
  // of a flat single color.
  const heroEl = captureTarget.querySelector<HTMLElement>(".glass-hero");
  if (heroEl) {
    paintForExport(heroEl, {
      background: "linear-gradient(135deg, #ffb066, #2f7fd6)",
      border: "none",
      boxShadow: "none",
    });
    const heroAurora = heroEl.querySelector<HTMLElement>(".hero-aurora");
    if (heroAurora) paintForExport(heroAurora, { display: "none" });
    for (const node of Array.from(heroEl.querySelectorAll<HTMLElement>("*"))) {
      paintForExport(node, { color: "#ffffff" });
    }
    paintForExport(heroEl, { color: "#ffffff" });
  }

  // Section cards + the "top issue" glow box — pale ice-blue card, no
  // translucency/blur (meaningless once flattened onto a white capture).
  for (const node of Array.from(captureTarget.querySelectorAll<HTMLElement>(".glass-card, .glow-ai"))) {
    paintForExport(node, {
      background: PDF_CARD_BG,
      border: `1px solid ${PDF_CARD_BORDER}`,
      boxShadow: "none",
      backdropFilter: "none",
    });
  }

  // Nested sub-boxes (diagnosis/decision text blocks) — plain white with a
  // faint border so they read as a distinct inset, not another dark panel.
  for (const node of Array.from(captureTarget.querySelectorAll<HTMLElement>(".bg-background\\/60"))) {
    paintForExport(node, { background: "#ffffff", border: `1px solid ${PDF_SUBBOX_BORDER}` });
  }

  // Every text node color — deep navy by default, cool-blue for the
  // existing "muted" meta text, both far above WCAG contrast on white
  // (unlike the flattened dark-glass-plus-light-text combination the bug
  // report was about).
  for (const node of Array.from(captureTarget.querySelectorAll<HTMLElement>("h3, p, span, li, td, th"))) {
    paintForExport(node, { color: PDF_INK });
  }
  for (const node of Array.from(captureTarget.querySelectorAll<HTMLElement>(".text-muted-foreground"))) {
    paintForExport(node, { color: PDF_MUTED_INK });
  }

  // Badge pills (declined-value / stopped-product / priority-debtor tags)
  // — warm pale-orange, matching the "برتقالي" half of the requested
  // palette, legible regardless of which Badge `variant` was used live.
  for (const node of Array.from(captureTarget.querySelectorAll<HTMLElement>(".rounded-full.border"))) {
    paintForExport(node, {
      background: PDF_BADGE_BG,
      border: `1px solid ${PDF_BADGE_BORDER}`,
      color: PDF_BADGE_INK,
    });
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(captureTarget, {
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: 2,
      // Capture the full scrollable content, not just the visible clipped
      // viewport — html2canvas otherwise only rasterizes what's on screen.
      height: captureTarget.scrollHeight,
      windowHeight: captureTarget.scrollHeight,
    });
  } finally {
    for (const restore of restoreBoxShadow) restore();
    for (const restore of pdfColorRestores) restore();
  }
  console.info("[daily-360-summary] PDF export: canvas captured", canvas.width, "x", canvas.height);

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

  console.info("[daily-360-summary] PDF export: saving", pageIndex, "page(s)");
  pdf.save(`daily-360-summary-${summary.reportDate}.pdf`);
}
