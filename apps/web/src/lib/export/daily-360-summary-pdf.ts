import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { VisitCopilot360LostOpportunity, VisitCopilot360Summary } from "@/lib/types";
import { sortDaily360Customers } from "@/lib/daily-360-customer-order";

export type Daily360PdfCaptureDimensions = { width: number; height: number };
export type Daily360PdfPageSlice = { y: number; height: number };
export type Daily360PdfCustomerGroup = {
  customerCode: string;
  customerName: string;
  opportunities: VisitCopilot360LostOpportunity[];
};

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 64;
const NAVY = "#123053";
const BLUE = "#1769d1";
const PALE_BLUE = "#edf5ff";
const BORDER = "#bfd6ef";
const AMBER = "#d97706";
const PAPER = "#fffdf8";

export function getDaily360PdfCaptureDimensions(element: Pick<HTMLElement, "scrollWidth" | "scrollHeight" | "getBoundingClientRect">): Daily360PdfCaptureDimensions {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(Math.max(rect.width, element.scrollWidth));
  const height = Math.ceil(Math.max(rect.height, element.scrollHeight));
  if (width < 1 || height < 1) throw new Error("Daily 360 report has no measurable content to export");
  return { width, height };
}

export function getDaily360PdfPageSlices(totalHeight: number, pageHeight: number): Daily360PdfPageSlice[] {
  if (totalHeight < 1 || pageHeight < 1) throw new Error("Daily 360 PDF page dimensions are invalid");
  const slices: Daily360PdfPageSlice[] = [];
  for (let y = 0; y < totalHeight; y += pageHeight) slices.push({ y, height: Math.min(pageHeight, totalHeight - y) });
  return slices;
}

export function assertDaily360PdfCanvas(canvas: Pick<HTMLCanvasElement, "width" | "height" | "toDataURL">): string {
  if (canvas.width < 1 || canvas.height < 1) throw new Error("Daily 360 export canvas is empty");
  const image = canvas.toDataURL("image/png");
  if (!image.startsWith("data:image/png;base64,") || image.length < 1_000) throw new Error("Daily 360 export image is empty");
  return image;
}
export function assertDaily360PdfBytes(bytes: Uint8Array): void {
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 4));
  if (bytes.byteLength < 1_000 || header !== "%PDF") throw new Error("Daily 360 PDF output is invalid");
}

export function groupDaily360PdfOpportunities(
  opportunities: readonly VisitCopilot360LostOpportunity[],
  uncategorized: string,
): Daily360PdfCustomerGroup[] {
  const customers = new Map<string, Daily360PdfCustomerGroup>();
  const seen = new Set<string>();
  for (const opportunity of opportunities) {
    const key = `${opportunity.customerCode}\u0000${opportunity.productCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const customer = customers.get(opportunity.customerCode) ?? {
      customerCode: opportunity.customerCode,
      customerName: opportunity.customerName,
      opportunities: [],
    };
    customer.opportunities.push(opportunity);
    customers.set(opportunity.customerCode, customer);
  }
  const groups = [...customers.values()].map((customer) => ({
    ...customer,
    opportunities: [...customer.opportunities].sort((a, b) =>
      a.category?.localeCompare(b.category ?? uncategorized, "ar")
      || b.declineValue - a.declineValue
      || a.productName.localeCompare(b.productName, "ar"),
    ),
  }));

  return sortDaily360Customers(groups, (customer) => ({
    customerName: customer.customerName,
    itemsCount: customer.opportunities.length,
    suggestedQuantity: customer.opportunities.reduce((sum, opportunity) => sum + opportunity.suggestedQuantity, 0),
  }));
}

type ReportPage = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; y: number };

function createPage(direction: CanvasDirection): ReportPage {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Daily 360 PDF canvas context is unavailable");
  context.fillStyle = PAPER;
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.direction = direction;
  context.textAlign = direction === "rtl" ? "right" : "left";
  context.textBaseline = "top";
  return { canvas, context, y: PAGE_MARGIN };
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrappedText(
  page: ReportPage,
  text: string,
  font: string,
  color: string,
  maxWidth: number,
  lineHeight: number,
  x: number,
): number {
  const { context } = page;
  context.font = font;
  context.fillStyle = color;
  const lines = wrapText(context, text, maxWidth);
  for (const line of lines) {
    context.fillText(line, x, page.y);
    page.y += lineHeight;
  }
  return lines.length * lineHeight;
}

function drawSectionCard(page: ReportPage, height: number): void {
  const { context } = page;
  context.fillStyle = PALE_BLUE;
  context.strokeStyle = BORDER;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(PAGE_MARGIN, page.y, PAGE_WIDTH - PAGE_MARGIN * 2, height, 14);
  context.fill();
  context.stroke();
}

function drawPageFooter(page: ReportPage, pageNumber: number, direction: CanvasDirection): void {
  const { context } = page;
  context.font = "500 18px Tahoma, Arial, sans-serif";
  context.fillStyle = "#54718e";
  context.textAlign = direction === "rtl" ? "right" : "left";
  context.fillText(`${pageNumber}`, direction === "rtl" ? PAGE_WIDTH - PAGE_MARGIN : PAGE_MARGIN, PAGE_HEIGHT - 38);
}


export function renderDaily360PdfPages(
  summary: VisitCopilot360Summary,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  onPage: (canvas: HTMLCanvasElement, pageNumber: number) => void,
): number {
  const locale = document.documentElement.lang || "ar";
  const direction: CanvasDirection = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
  const contentX = direction === "rtl" ? PAGE_WIDTH - PAGE_MARGIN - 28 : PAGE_MARGIN + 28;
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2 - 56;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  let page = createPage(direction);
  let pageNumber = 1;

  const current = () => page;
  const finishPage = () => {
    drawPageFooter(current(), pageNumber, direction);
    onPage(current().canvas, pageNumber);
  };
  const nextPage = () => {
    finishPage();
    pageNumber += 1;
    page = createPage(direction);
  };
  const ensure = (height: number) => {
    if (current().y + height > PAGE_HEIGHT - PAGE_MARGIN) nextPage();
  };
  const label = (key: TranslationKey, value?: number) => value === undefined ? t(key) : t(key, { value: number.format(value) });

  current().context.fillStyle = NAVY;
  current().context.fillRect(PAGE_MARGIN, current().y, PAGE_WIDTH - PAGE_MARGIN * 2, 88);
  current().context.fillStyle = "#ffffff";
  current().context.font = "700 38px Tahoma, Arial, sans-serif";
  current().context.fillText(t("copilot.summary360Title"), contentX, current().y + 20);
  current().y += 110;
  drawSectionCard(current(), 96);
  current().y += 18;
  drawWrappedText(current(), t("copilot.summary360ScopeLine", {
    scope: summary.scopeLabel,
    role: summary.roleLabel,
    user: summary.userName,
    from: summary.period.from,
    to: summary.period.to,
  }), "500 21px Tahoma, Arial, sans-serif", NAVY, contentWidth, 31, contentX);
  current().y += 26;

  ensure(120);
  drawSectionCard(current(), 98);
  current().y += 16;
  drawWrappedText(current(), t("copilot.summary360ExecutiveSummary"), "700 25px Tahoma, Arial, sans-serif", BLUE, contentWidth, 32, contentX);
  drawWrappedText(current(), summary.executiveSummary, "400 20px Tahoma, Arial, sans-serif", NAVY, contentWidth, 30, contentX);
  current().y += 28;

  const groups = groupDaily360PdfOpportunities(summary.lostOpportunities, t("copilot.summary360Uncategorized"));
  ensure(48);
  drawWrappedText(current(), t("copilot.summary360LostOpportunities"), "700 30px Tahoma, Arial, sans-serif", NAVY, contentWidth, 38, contentX);
  current().y += 10;

  for (const customer of groups) {
    const totalSuggested = customer.opportunities.reduce((sum, opportunity) => sum + opportunity.suggestedQuantity, 0);
    const totalDecline = customer.opportunities.reduce((sum, opportunity) => sum + opportunity.declineValue, 0);
    ensure(144);
    drawSectionCard(current(), 124);
    current().y += 16;
    drawWrappedText(current(), customer.customerName, "700 25px Tahoma, Arial, sans-serif", NAVY, contentWidth, 32, contentX);
    drawWrappedText(
      current(),
      `${label("copilot.summary360OpportunityCount", customer.opportunities.length)}  |  ${label("copilot.summary360ProductCount", customer.opportunities.length)}  |  ${label("copilot.summary360SuggestedQuantity", totalSuggested)}  |  ${label("copilot.summary360DeclineQuantity", totalDecline)}`,
      "500 18px Tahoma, Arial, sans-serif",
      AMBER,
      contentWidth,
      26,
      contentX,
    );
    current().y += 28;

    let category = "";
    for (const opportunity of customer.opportunities) {
      const nextCategory = opportunity.category?.trim() || t("copilot.summary360Uncategorized");
      if (nextCategory !== category) {
        ensure(56);
        category = nextCategory;
        current().context.fillStyle = BLUE;
        current().context.font = "700 22px Tahoma, Arial, sans-serif";
        current().context.fillText(category, contentX, current().y);
        current().y += 36;
      }
      ensure(190);
      drawSectionCard(current(), 168);
      current().y += 14;
      drawWrappedText(current(), opportunity.productName, "700 21px Tahoma, Arial, sans-serif", NAVY, contentWidth, 28, contentX);
      drawWrappedText(
        current(),
        `${label("copilot.summary360BaselineQuantity", opportunity.baselineNetQuantity)}  |  ${label("copilot.summary360RecentQuantity", opportunity.recentNetQuantity)}  |  ${label("copilot.summary360DeclineQuantity", opportunity.declineValue)}  |  ${label("copilot.summary360SuggestedQuantity", opportunity.suggestedQuantity)}`,
        "500 17px Tahoma, Arial, sans-serif",
        "#365c82",
        contentWidth,
        25,
        contentX,
      );
      drawWrappedText(current(), `${t("copilot.summary360Diagnosis")}: ${opportunity.diagnosis}`, "400 17px Tahoma, Arial, sans-serif", NAVY, contentWidth, 24, contentX);
      drawWrappedText(current(), `${t("copilot.summary360VisitDecision")}: ${opportunity.visitDecision}`, "400 17px Tahoma, Arial, sans-serif", NAVY, contentWidth, 24, contentX);
      if (opportunity.visitGoal) drawWrappedText(current(), `${t("copilot.summary360VisitGoal")}: ${opportunity.visitGoal}`, "400 17px Tahoma, Arial, sans-serif", NAVY, contentWidth, 24, contentX);
      current().y += 22;
    }
  }

  finishPage();
  return pageNumber;
}

export async function exportDaily360SummaryPdf(
  summary: VisitCopilot360Summary,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): Promise<void> {
  let phase = "load PDF renderer";
  try {
    await document.fonts?.ready;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let renderedPages = 0;

    phase = "render report data";
    renderDaily360PdfPages(summary, t, (canvas) => {
      const image = assertDaily360PdfCanvas(canvas);
      if (renderedPages > 0) pdf.addPage();
      pdf.addImage(image, "PNG", 0, 0, pageWidth, pageHeight);
      renderedPages += 1;
      canvas.width = 1;
      canvas.height = 1;
    });
    if (renderedPages === 0) throw new Error("Daily 360 report has no pages");

    phase = "validate PDF bytes";
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    assertDaily360PdfBytes(bytes);

    phase = "trigger download";
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-360-summary-${summary.reportDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[daily-360-summary] PDF export failed", { phase, detail, error });
    throw new Error(`Daily 360 PDF export failed during ${phase}: ${detail}`);
  }
}
