// FDA Local Decision Layer — Intent Dispatcher (Task Station: Time Context
// Parser + Intent Dispatcher, 2026-07-26).
//
// Connects the design-only ASSISTANT_INTENT_REGISTRY (assistant-intent-
// registry.data.ts, 41 intents) to real execution for the first time. This
// is intentionally a SEPARATE mechanism from LocalDecisionEngine/rule-
// engine.ts, not an extension of it — an Intent additionally needs entity
// resolution (entity-resolution.ts) and time-context parsing (time-context-
// parser.ts) satisfied before it can even attempt a Business Service call,
// which RuleDefinition's plain {pattern -> facts -> answer} contract has no
// room for. See the Registry file's own "what this file is NOT yet" note.
//
// Per Task Brief scope: only intents with canAnswerLocally === "yes" are
// wired to real execution here, and only a first slice of 3-5 (not all 41).
// Everything else in the Registry is inert data this pass doesn't touch.
//
// This file is NOT wired into AssistantService.chat() in this pass — see
// Task Brief scope (out). It is a standalone, independently testable
// mechanism, matching how entity-resolution.ts and time-context-parser.ts
// were each verified standalone before any wiring happened.

import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import { PrismaService } from "../../common/prisma";
import { ASSISTANT_INTENT_REGISTRY, type AssistantIntent } from "./assistant-intent-registry.data";
import { parseTimeContext, type DateRange } from "./time-context-parser";
import { joinInvoiceHeaderAndItems, type DatasetRow } from "../files/dataset-query.util";

export type IntentDispatchOutcome =
  | { status: "answered"; intentId: string; text: string }
  | { status: "needs_time_context"; intentId: string; clarificationMessage: string }
  | { status: "not_matched" }; // no wired intent recognized this message — caller falls through to AI unchanged

// Simple keyword triggers per wired intent — consistent with the Rule
// Engine's "exact keyword/pattern matching only" philosophy, not an NLU
// classifier. Kept narrow deliberately: a missed trigger falls through to
// the normal AI loop (no regression); an over-eager trigger would wrongly
// intercept an unrelated question, which is the worse failure mode.
// 2026-07-26 fix: a real user message "عايز اجمالي مبيعات اليوم" incurred an
// AI call it should not have — traced via temp debug + reproduced
// deterministically: "اجمالي مبيعات" (no "ال" before "مبيعات") is a
// genuinely different substring than "اجمالي المبيعات"/"إجمالي المبيعات"
// (with "ال"), so `.includes()` correctly did not match either existing
// variant. Fixed by adding the no-definite-article phrasing alongside the
// existing ones for both GetTotalSales and GetCollectionsTotal (the
// identical gap exists there too) — same keyword-literal-match philosophy,
// no new intent, no entity/time-context logic changed.
const INTENT_TRIGGERS: Record<string, readonly string[]> = {
  GetTotalSales: ["إجمالي المبيعات", "اجمالي المبيعات", "إجمالي مبيعات", "اجمالي مبيعات", "المبيعات الكلية", "كام باعنا"],
  GetCollectionsTotal: ["إجمالي التحصيل", "اجمالي التحصيل", "إجمالي تحصيل", "اجمالي تحصيل", "التحصيلات الكلية", "كام اتحصل"],
  GetOverdueCollections: ["تحصيلات متأخرة", "فلوس متأخرة", "تحصيل متأخر"],
};

function detectIntentId(message: string): string | null {
  for (const [intentId, terms] of Object.entries(INTENT_TRIGGERS)) {
    if (terms.some((t) => message.includes(t))) return intentId;
  }
  return null;
}

function findIntent(intentId: string): AssistantIntent | undefined {
  return ASSISTANT_INTENT_REGISTRY.find((i) => i.intentId === intentId);
}

// 2026-07-26 fix: response templates hardcoded "جنيه" (Egyptian Pound)
// regardless of the company's actual country/currency — wrong for any
// non-Egypt company (e.g. Saudi companies use ريال). Real source of truth
// is CompanyProfile.currency (packages/database/prisma/schema.prisma), a
// nullable free-text field — same field the Settings screen already reads
// (apps/web/src/app/(dashboard)/dashboard/settings/page.tsx) and the same
// direct `prisma.companyProfile.findUnique` pattern visit-copilot.service.ts
// already uses for company settings lookups. No currency code->symbol
// mapping is invented here — the field is displayed exactly as the company
// entered it in Settings. Falls back to an explicit "غير محدد" (not set)
// label rather than silently assuming a currency when the profile has none,
// consistent with this module's "never guess" discipline.
async function resolveCurrencyLabel(prisma: PrismaService, companyId: string): Promise<string> {
  try {
    const profile = await prisma.companyProfile.findUnique({ where: { companyId } });
    const currency = profile?.currency?.trim();
    return currency && currency.length > 0 ? currency : "غير محدد";
  } catch {
    // Best-effort, same fail-open discipline as every other lookup in this
    // module — a currency-lookup failure must not block the numeric answer.
    return "غير محدد";
  }
}

function fmtMoney(n: number): string {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

// Every date field this dispatcher filters by (InvoiceDate, CollectionDate)
// is a plain date string per the import templates — same convention
// time-context-parser.ts documents. Comparison is done as ISO string
// comparison after normalizing to YYYY-MM-DD, which sorts correctly for
// same-format dates; values that don't parse as dates are excluded rather
// than guessed.
function rowDateInRange(row: DatasetRow, dateColumn: string, range: DateRange): boolean {
  const raw = row[dateColumn];
  if (raw === null || raw === undefined || raw === "") return false;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return false;
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return iso >= range.start && iso <= range.end;
}

function findColumn(fields: readonly string[], candidates: readonly string[]): string | null {
  for (const c of candidates) {
    const hit = fields.find((f) => f.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

async function handleGetTotalSales(rieFacade: RieFacade, prisma: PrismaService, user: AuthenticatedUser, range: DateRange, periodLabel: string): Promise<string> {
  const ctx = { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  const [items, invoices, currency] = await Promise.all([
    rieFacade.getEntityRecords("Invoice Items", ctx),
    rieFacade.getEntityRecords("Invoices", ctx),
    resolveCurrencyLabel(prisma, user.companyId!),
  ]);

  if (!items.available || !invoices.available) {
    return "لا توجد بيانات فواتير متاحة حاليًا للشركة — تأكد من رفع ملفات Invoices وInvoice Items أولاً.";
  }

  const itemInvoiceCol = findColumn(items.fields, ["InvoiceNo"]);
  const headerInvoiceCol = findColumn(invoices.fields, ["InvoiceNo"]);
  const dateCol = findColumn(invoices.fields, ["InvoiceDate"]);
  const lineTotalCol = findColumn(items.fields, ["LineTotal"]);

  if (!itemInvoiceCol || !headerInvoiceCol || !dateCol || !lineTotalCol) {
    return "تعذر إيجاد الأعمدة المطلوبة (InvoiceNo / InvoiceDate / LineTotal) في بيانات الفواتير الحالية.";
  }

  const joined = joinInvoiceHeaderAndItems(
    invoices.records as DatasetRow[],
    invoices.fields as string[],
    headerInvoiceCol,
    items.records as DatasetRow[],
    items.fields as string[],
    itemInvoiceCol,
  );

  const inRange = joined.rows.filter((row) => rowDateInRange(row, dateCol, range));
  const total = inRange.reduce((sum, row) => {
    const n = Number(row[lineTotalCol]);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  return `إجمالي المبيعات خلال ${periodLabel}: ${fmtMoney(total)} ${currency}.`;
}

async function handleGetCollectionsTotal(rieFacade: RieFacade, prisma: PrismaService, user: AuthenticatedUser, range: DateRange, periodLabel: string): Promise<string> {
  const ctx = { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  const [result, currency] = await Promise.all([rieFacade.getEntityRecords("Collections", ctx), resolveCurrencyLabel(prisma, user.companyId!)]);

  if (!result.available) {
    return "لا توجد بيانات تحصيل متاحة حاليًا للشركة — تأكد من رفع ملف Collections أولاً.";
  }

  const dateCol = findColumn(result.fields, ["CollectionDate"]);
  const amountCol = findColumn(result.fields, ["Amount"]);
  if (!dateCol || !amountCol) {
    return "تعذر إيجاد الأعمدة المطلوبة (CollectionDate / Amount) في بيانات التحصيل الحالية.";
  }

  const inRange = (result.records as DatasetRow[]).filter((row) => rowDateInRange(row, dateCol, range));
  const total = inRange.reduce((sum, row) => {
    const n = Number(row[amountCol]);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  return `إجمالي التحصيل خلال ${periodLabel}: ${fmtMoney(total)} ${currency}.`;
}

async function handleGetOverdueCollections(rieFacade: RieFacade, prisma: PrismaService, user: AuthenticatedUser): Promise<string> {
  const ctx = { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  const [result, currency] = await Promise.all([rieFacade.getEntityRecords("Collections", ctx), resolveCurrencyLabel(prisma, user.companyId!)]);

  if (!result.available) {
    return "لا توجد بيانات تحصيل متاحة حاليًا للشركة — تأكد من رفع ملف Collections أولاً.";
  }

  const statusCol = findColumn(result.fields, ["Status"]);
  const dueDateCol = findColumn(result.fields, ["DueDate"]);
  const amountCol = findColumn(result.fields, ["Amount"]);
  const customerCol = findColumn(result.fields, ["CustomerCode"]);
  if (!statusCol || !dueDateCol || !amountCol) {
    return "تعذر إيجاد الأعمدة المطلوبة (Status / DueDate / Amount) في بيانات التحصيل الحالية.";
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const overdue = (result.records as DatasetRow[]).filter((row) => {
    const status = String(row[statusCol] ?? "").trim().toLowerCase();
    if (status !== "pending") return false;
    const due = row[dueDateCol];
    if (due === null || due === undefined || due === "") return false;
    const d = new Date(String(due));
    if (Number.isNaN(d.getTime())) return false;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return iso < todayIso;
  });

  const total = overdue.reduce((sum, row) => {
    const n = Number(row[amountCol]);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  const customerCount = customerCol ? new Set(overdue.map((r) => String(r[customerCol] ?? ""))).size : overdue.length;

  return `إجمالي التحصيلات المتأخرة: ${fmtMoney(total)} ${currency}، عدد العملاء: ${customerCount}.`;
}

// Single entry point. Returns "not_matched" for any message that doesn't
// hit one of the (currently 3) wired intents — callers fall through to the
// existing AI loop exactly as if this dispatcher didn't run, same
// fail-open discipline as every other Local Decision Layer step.
export async function dispatchIntent(rieFacade: RieFacade, prisma: PrismaService, user: AuthenticatedUser, message: string): Promise<IntentDispatchOutcome> {
  const intentId = detectIntentId(message);
  if (!intentId) return { status: "not_matched" };

  const intent = findIntent(intentId);
  if (!intent) return { status: "not_matched" }; // trigger table and Registry drifted — fail safe, not a crash

  if (intent.canAnswerLocally !== "yes") return { status: "not_matched" }; // guards against a future trigger added for a partial/no intent by mistake

  let range: DateRange | undefined;
  let periodLabel = "";
  if (intent.requiredTimeContext !== "None") {
    const parsed = parseTimeContext(message);
    if (parsed.status === "unresolved") {
      return {
        status: "needs_time_context",
        intentId,
        clarificationMessage: "محتاج أعرف الفترة الزمنية المقصودة بالظبط (مثلاً: اليوم، هذا الشهر، الشهر الماضي، أو نطاق تاريخ محدد).",
      };
    }
    range = parsed.range;
    periodLabel = parsed.label;
  }

  try {
    switch (intentId) {
      case "GetTotalSales": {
        const text = await handleGetTotalSales(rieFacade, prisma, user, range!, periodLabel);
        return { status: "answered", intentId, text };
      }
      case "GetCollectionsTotal": {
        const text = await handleGetCollectionsTotal(rieFacade, prisma, user, range!, periodLabel);
        return { status: "answered", intentId, text };
      }
      case "GetOverdueCollections": {
        const text = await handleGetOverdueCollections(rieFacade, prisma, user);
        return { status: "answered", intentId, text };
      }
      default:
        return { status: "not_matched" };
    }
  } catch {
    // Best-effort, same fail-open discipline as the Dictionary Engine and
    // Entity Resolution blocks in assistant.service.ts — a lookup failure
    // must never block the chat; falls through to AI instead of refusing.
    return { status: "not_matched" };
  }
}

// Exported for the verification pass / future callers that want to inspect
// which intents this dispatcher currently wires without re-deriving it from
// INTENT_TRIGGERS.
export const WIRED_INTENT_IDS: readonly string[] = Object.keys(INTENT_TRIGGERS);
