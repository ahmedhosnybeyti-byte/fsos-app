// Visit Copilot — Rule Registry.
//
// This is the assistant-specific piece of the FDA Local Decision Layer: the
// actual list of direct, known-shape questions Visit Copilot can answer
// straight from CustomerBriefingResult, with zero AI calls. The matching /
// priority / execution / rendering mechanism itself lives in the shared,
// generic engine (../local-decision/rule-engine.ts) — this file contributes
// data only (a RuleRegistry<BriefingFacts>), never engine logic.
//
// Scope kept deliberately small per the client's explicit instruction: add
// a pattern only when it measurably removes an AI call for a question the
// rule-based briefing can already answer outright. Not a general intent
// classifier — FDA's Rule Engine is exact keyword/pattern matching only.

import type { RuleRegistry } from "../local-decision/rule-engine";
import type { LocalSection } from "../local-decision/template-builder";

// Minimal shape this registry needs — matches CustomerBriefingResult's
// relevant fields without importing the full VisitCopilotService type
// (keeps this file testable/standalone per FDA's Engine Independence rule).
export interface BriefingFacts {
  customerCode: string;
  customerName: string;
  period: { from: string; to: string };
  collections: { collected: number; pending: number; bounced: number; oldestPendingDueDate: string | null };
  returns: { total: number; rate: number | null };
  topOpportunity: string;
  suggestedGoal: string;
  missingProducts: { productName: string }[];
  topProducts: { productName: string; qty: number; value: number }[];
  sales: { total: number; invoiceCount: number; trendPct: number | null };
}

function fmt(n: number): string {
  return n.toLocaleString("ar-EG", { maximumFractionDigits: 2 });
}

// Order matters — first match wins (registration order = priority, unless a
// rule sets an explicit `priority`). Each pattern targets one unambiguous
// Arabic phrasing already used elsewhere in this codebase's own generated
// strings (composeGuidance), so the vocabulary is consistent end-to-end.
//
// Customer 360 is registered FIRST (explicit low priority number) — it's
// the more specific multi-section match; the single-field patterns below
// (e.g. "الرصيد", "أفضل منتج") would otherwise fire first against a
// "Customer 360" message that also happens to contain their keywords.
export const VisitCopilotRuleRegistry: RuleRegistry<BriefingFacts> = [
  {
    id: "customer-360",
    priority: 0,
    pattern: /customer ?360|360|بروفايل|ملف العميل الكامل/i,
    answer: (f) => {
      const identity: LocalSection = {
        heading: "بيانات العميل",
        lines: [`العميل: ${f.customerName}`, `الكود: ${f.customerCode}`, `الفترة: ${f.period.from} إلى ${f.period.to}`],
      };

      const performance: LocalSection = {
        heading: "ملخص الأداء",
        lines: [
          `إجمالي المبيعات: ${fmt(f.sales.total)} ج.م`,
          `عدد الفواتير: ${f.sales.invoiceCount}`,
          ...(f.sales.trendPct !== null ? [`الاتجاه: ${f.sales.trendPct >= 0 ? "+" : ""}${f.sales.trendPct}%`] : []),
        ],
      };

      const products: LocalSection = {
        heading: "أكثر الأصناف مبيعًا",
        lines: f.topProducts.map((p, i) => `${i + 1}. ${p.productName} — ${fmt(p.value)} ج.م (كمية: ${fmt(p.qty)})`),
      };

      const collections: LocalSection = {
        heading: "حالة التحصيل",
        lines: [
          `المحصّل: ${fmt(f.collections.collected)} ج.م`,
          `المعلّق: ${fmt(f.collections.pending)} ج.م`,
          `المرتد: ${fmt(f.collections.bounced)} ج.م`,
          ...(f.collections.oldestPendingDueDate ? [`أقدم استحقاق معلّق: ${f.collections.oldestPendingDueDate}`] : []),
        ],
      };

      const returns: LocalSection = {
        heading: "المرتجعات",
        lines: [`إجمالي المرتجعات: ${fmt(f.returns.total)} ج.م`, ...(f.returns.rate !== null ? [`نسبة المرتجعات: ${f.returns.rate}%`] : [])],
      };

      const missing: LocalSection = {
        heading: "منتجات ناقصة عند العميل",
        lines: f.missingProducts.map((p) => p.productName),
      };

      const decision: LocalSection = {
        heading: "أهم قرار للزيارة",
        lines: [f.topOpportunity, f.suggestedGoal].filter((s) => s.trim() !== ""),
      };

      return {
        kind: "sections",
        title: `Customer 360 — ${f.customerName}`,
        value: [identity, performance, products, collections, returns, missing, decision],
      };
    },
  },
  {
    id: "overdue-balance",
    pattern: /متأخر|مرتد|تحصيل معلق|الرصيد/,
    answer: (f) => {
      const overdue = f.collections.pending + f.collections.bounced;
      return {
        kind: "answer",
        value: {
          title: "الرصيد المتأخر",
          value: `${fmt(overdue)} ج.م`,
          contextLine: f.collections.oldestPendingDueDate ? `أقدم استحقاق: ${f.collections.oldestPendingDueDate}` : undefined,
        },
      };
    },
  },
  {
    id: "top-opportunity",
    pattern: /أهم فرصة|فرصة اليوم|topOpportunity|الفرصة/,
    answer: (f) => ({ kind: "answer", value: { title: "أهم فرصة", value: f.topOpportunity } }),
  },
  {
    id: "visit-goal",
    pattern: /هدف الزيارة|هدف اليوم/,
    answer: (f) => ({ kind: "answer", value: { title: "هدف الزيارة", value: f.suggestedGoal } }),
  },
  {
    id: "missing-products",
    pattern: /منتجات ناقصة|أصناف ناقصة|بيع متقاطع|cross.?sell/i,
    answer: (f) => ({
      kind: "answer",
      value: {
        title: "منتجات ناقصة عند العميل",
        value: f.missingProducts.length > 0 ? f.missingProducts.map((p) => p.productName).join("، ") : "لا توجد اقتراحات حاليًا",
      },
    }),
  },
  {
    id: "top-product",
    pattern: /أفضل منتج|أعلى منتج|top ?product/i,
    answer: (f) => {
      const top = f.topProducts[0];
      return {
        kind: "answer",
        value: top ? { title: "أفضل منتج", value: top.productName, contextLine: `القيمة: ${fmt(top.value)} ج.م` } : { title: "أفضل منتج", value: "لا توجد بيانات كافية" },
      };
    },
  },
  {
    id: "total-sales",
    pattern: /إجمالي المبيعات|المبيعات كام|قيمة المبيعات/,
    answer: (f) => ({
      kind: "answer",
      value: {
        title: "إجمالي المبيعات",
        value: `${fmt(f.sales.total)} ج.م`,
        contextLine: f.sales.trendPct !== null ? `الاتجاه: ${f.sales.trendPct >= 0 ? "+" : ""}${f.sales.trendPct}%` : undefined,
      },
    }),
  },
];
