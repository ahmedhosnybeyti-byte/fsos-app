import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { VisitCopilot360Summary } from "@/lib/types";

export type Daily360PdfCaptureDimensions = { width: number; height: number };

const EXPORT_PAGE_WIDTH = 900;
const EXPORT_PAGE_HEIGHT = 1_200;

export function getDaily360PdfCaptureDimensions(element: Pick<HTMLElement, "scrollWidth" | "scrollHeight" | "getBoundingClientRect">): Daily360PdfCaptureDimensions {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(Math.max(rect.width, element.scrollWidth));
  const height = Math.ceil(Math.max(rect.height, element.scrollHeight));
  if (width < 1 || height < 1) throw new Error("Daily 360 report has no measurable content to export");
  return { width, height };
}

export function getDaily360PdfPageSlices(totalHeight: number, pageHeight = EXPORT_PAGE_HEIGHT): Array<{ y: number; height: number }> {
  if (totalHeight < 1 || pageHeight < 1) throw new Error("Daily 360 PDF page dimensions are invalid");
  const slices: Array<{ y: number; height: number }> = [];
  for (let y = 0; y < totalHeight; y += pageHeight) slices.push({ y, height: Math.min(pageHeight, totalHeight - y) });
  return slices;
}

export function assertDaily360PdfCanvas(canvas: Pick<HTMLCanvasElement, "width" | "height" | "toDataURL">): string {
  if (canvas.width < 1 || canvas.height < 1) throw new Error("Daily 360 export canvas is empty");
  const image = canvas.toDataURL("image/png");
  if (!image.startsWith("data:image/png;base64,") || image.length < 1_000) throw new Error("Daily 360 export image is empty");
  return image;
}

function buildDaily360ExportClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.id = "daily-360-summary-export-clone";
  clone.setAttribute("data-daily-360-export", "true");
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.dir = source.closest("[dir]")?.getAttribute("dir") ?? (document.documentElement.dir || "ltr");
  clone.style.cssText = [
    "position:absolute", "left:-100000px", "top:0", `width:${EXPORT_PAGE_WIDTH}px`, "height:auto", "min-height:1px",
    "display:block", "visibility:visible", "overflow:visible", "box-sizing:border-box", "padding:24px",
    "background:#fffdf8", "color:#14304d", "font-family:Tahoma, Arial, sans-serif", "line-height:1.5", "z-index:-1",
  ].join(";");

  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("*"))) {
    element.removeAttribute("class");
    element.removeAttribute("style");
    element.style.boxSizing = "border-box";
    element.style.color = "#14304d";
    element.style.backgroundColor = "transparent";
    element.style.borderColor = "#cbd5e1";
    element.style.fontFamily = "Tahoma, Arial, sans-serif";
    element.style.backdropFilter = "none";
    element.style.boxShadow = "none";
  }

  for (const icon of Array.from(clone.querySelectorAll("svg, script, style"))) icon.remove();
  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("section, article, header, div, table"))) {
    element.style.display = element.tagName === "TABLE" ? "table" : "block";
    element.style.width = "100%";
  }
  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("section, article"))) {
    element.style.marginBottom = "14px";
    element.style.padding = "14px";
    element.style.border = "1px solid #bcd4ec";
    element.style.borderRadius = "8px";
    element.style.backgroundColor = "#eef4fb";
  }
  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("button, details, summary"))) {
    element.style.display = "block";
    element.style.width = "100%";
    element.style.padding = "8px 0";
    element.style.border = "0";
    element.style.backgroundColor = "transparent";
    element.style.textAlign = clone.dir === "rtl" ? "right" : "left";
  }
  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("p, li, td, th, span"))) element.style.margin = "0 0 6px";
  return clone;
}

async function waitForDaily360ExportRender(): Promise<void> {
  await document.fonts?.ready;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function exportDaily360SummaryPdf(
  summary: VisitCopilot360Summary,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): Promise<void> {
  let phase = "locate report";
  let clone: HTMLElement | null = null;
  try {
    const root = document.getElementById("daily-360-summary-print-root");
    if (!root) throw new Error("daily-360-summary-print-root not found");

    phase = "build safe export document";
    clone = buildDaily360ExportClone(root);
    document.body.appendChild(clone);
    await waitForDaily360ExportRender();
    const captureSize = getDaily360PdfCaptureDimensions(clone);

    phase = "load PDF renderer";
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageHeightCss = Math.max(1, Math.floor((pageHeight * captureSize.width) / pageWidth));
    const slices = getDaily360PdfPageSlices(captureSize.height, pageHeightCss);

    for (const [index, slice] of slices.entries()) {
      phase = `render page ${index + 1} of ${slices.length}`;
      const canvas = await html2canvas(clone, {
        backgroundColor: "#fffdf8",
        height: slice.height,
        logging: false,
        scale: 2,
        useCORS: true,
        width: captureSize.width,
        windowHeight: slice.height,
        windowWidth: captureSize.width,
        x: 0,
        y: slice.y,
      });
      const image = assertDaily360PdfCanvas(canvas);
      if (index > 0) pdf.addPage();
      pdf.addImage(image, "PNG", 0, 0, pageWidth, (slice.height * pageWidth) / captureSize.width);
    }

    phase = "save PDF";
    pdf.save(`daily-360-summary-${summary.reportDate}.pdf`);
    void t;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[daily-360-summary] PDF export failed", { phase, detail, error });
    throw new Error(`Daily 360 PDF export failed during ${phase}: ${detail}`);
  } finally {
    clone?.remove();
  }
}
