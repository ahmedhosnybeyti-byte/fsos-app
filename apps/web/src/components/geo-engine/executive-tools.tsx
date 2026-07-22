"use client";

import { useEffect, useState, type RefObject } from "react";
import { Maximize, Minimize, RotateCcw, Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/translation-provider";

// Geo Intelligence Engine — Phase 3 Executive tools (Fullscreen / Reset View
// / Export Image / Export PDF). Nothing in this codebase already does DOM
// capture or native Fullscreen (confirmed by repo-wide search, 2026-07-22 —
// Territory Intelligence's own "Export Image"/"Export PPT" buttons are
// disabled "Coming soon" placeholders with no implementation behind them);
// this is genuinely new code, not a reuse of an existing pattern, using the
// same "dynamic-import-on-click, keep it out of the SSR bundle" convention
// already established for xlsx/pptxgenjs elsewhere in this app.
export function ExecutiveTools({ targetRef, onReset }: { targetRef: RefObject<HTMLElement | null>; onReset: () => void }) {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Fullscreens the WHOLE document (`documentElement`), not `targetRef`'s
  // own element — found via live user testing (2026-07-22): filter dropdowns
  // (Select/MultiSelectFilter) render their popup content into a React
  // portal attached to `document.body`, per Radix's default behavior. When
  // only `targetRef`'s div was put into fullscreen, `document.body` — and
  // everything portaled into it — sat outside the fullscreened element's
  // subtree, so every dropdown still opened (state updated fine) but its
  // popup content was invisible/unreachable, reading as "the filters don't
  // work." Fullscreening `documentElement` instead keeps `document.body` (and
  // therefore every portal) inside the fullscreened tree, at the one-time
  // cost of the dashboard's own sidebar/header also being visible — a far
  // safer fix than teaching every dropdown a custom portal container, which
  // would touch shared UI primitives used across the whole app. Export Image/
  // PDF are unaffected — `captureCanvas()` below still targets `targetRef`
  // only, so exports stay scoped to just the Geo Engine workspace.
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }

  async function captureCanvas() {
    const el = targetRef.current;
    if (!el) return null;
    const html2canvas = (await import("html2canvas")).default;
    return html2canvas(el, { useCORS: true, backgroundColor: "#ffffff", scale: 2 });
  }

  async function exportImage() {
    setIsExporting(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `geo-intelligence-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      toast.error(t("geoEngine.executiveExportError"));
    } finally {
      setIsExporting(false);
    }
  }

  async function exportPdf() {
    setIsExporting(true);
    try {
      const canvas = await captureCanvas();
      if (!canvas) return;
      const { jsPDF } = await import("jspdf");
      const isLandscape = canvas.width >= canvas.height;
      const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgRatio = canvas.width / canvas.height;
      let renderWidth = pageWidth;
      let renderHeight = pageWidth / imgRatio;
      if (renderHeight > pageHeight) {
        renderHeight = pageHeight;
        renderWidth = pageHeight * imgRatio;
      }
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pageWidth - renderWidth) / 2, (pageHeight - renderHeight) / 2, renderWidth, renderHeight);
      pdf.save(`geo-intelligence-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch {
      toast.error(t("geoEngine.executiveExportError"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onReset}>
        <RotateCcw className="h-3.5 w-3.5" />
        {t("geoEngine.executiveReset")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={toggleFullscreen}>
        {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
        {isFullscreen ? t("geoEngine.executiveExitFullscreen") : t("geoEngine.executiveFullscreen")}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={exportImage}>
        <Download className="h-3.5 w-3.5" />
        {t("geoEngine.executiveExportImage")}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={isExporting} onClick={exportPdf}>
        <FileDown className="h-3.5 w-3.5" />
        {t("geoEngine.executiveExportPdf")}
      </Button>
    </div>
  );
}
