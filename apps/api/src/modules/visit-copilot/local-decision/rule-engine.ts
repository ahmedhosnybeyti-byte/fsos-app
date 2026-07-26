// FDA Local Decision Layer — Rule Engine.
//
// Matches direct, known-shape questions against the CustomerBriefingResult
// that VisitCopilotService already computes (rule-based, no AI) for every
// chat turn. If a pattern matches, the answer comes straight from that
// object — zero AI calls. Anything not matched here falls through
// unchanged to the existing Claude call in VisitCopilotService.chat().
//
// Scope kept deliberately small per the client's explicit instruction: add
// a pattern only when it measurably removes an AI call for a question the
// rule-based briefing can already answer outright. Not a general intent
// classifier — FDA's Rule Engine is exact keyword/pattern matching only.

import type { LocalAnswer, LocalSection } from "./template-builder";
import { renderLocalSections } from "./template-builder";

// Minimal shape this engine needs — matches CustomerBriefingResult's
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

type Rule = { pattern: RegExp; answer: (f: BriefingFacts) => LocalAnswer };

// Order matters — first match wins. Each pattern targets one unambiguous
// Arabic phrasing already used elsewhere in this codebase's own generated
// strings (composeGuidance), so the vocabulary is consistent end-to-end.
const RULES: Rule[] = [
  {
    pattern: /متأخر|مرتد|تحصيل معلق|الرصيد/,
    answer: (f) => {
      const overdue = f.collections.pending + f.collections.bounced;
      return {
        title: "الرصيد المتأخر",
        value: `${fmt(overdue)} ج.م`,
        contextLine: f.collections.oldestPendingDueDate ? `أقدم استحقاق: ${f.collections.oldestPendingDueDate}` : undefined,
      };
    },
  },
  {
    pattern: /أهم فرصة|فرصة اليوم|topOpportunity|الفرصة/,
    answer: (f) => ({ title: "أهم فرصة", value: f.topOpportunity }),
  },
  {
    pattern: /هدف الزيارة|هدف اليوم/,
    answer: (f) => ({ title: "هدف الزيارة", value: f.suggestedGoal }),
  },
  {
    pattern: /منتجات ناقصة|أصناف ناقصة|بيع متقاطع|cross.?sell/i,
    answer: (f) => ({
      title: "منتجات ناقصة عند العميل",
      value: f.missingProducts.length > 0 ? f.missingProducts.map((p) => p.productName).join("، ") : "لا توجد اقتراحات حاليًا",
    }),
  },
  {
    pattern: /أفضل منتج|أعلى منتج|top ?product/i,
    answer: (f) => {
      const top = f.topProducts[0];
      return top ? { title: "أفضل منتج", value: top.productName, contextLine: `القيمة: ${fmt(top.value)} ج.م` } : { title: "أفضل منتج", value: "لا توجد بيانات كافية" };
    },
  },
  {
    pattern: /إجمالي المبيعات|المبيعات كام|قيمة المبيعات/,
    answer: (f) => ({
      title: "إجمالي المبيعات",
      value: `${fmt(f.sales.total)} ج.م`,
      contextLine: f.sales.trendPct !== null ? `الاتجاه: ${f.sales.trendPct >= 0 ? "+" : ""}${f.sales.trendPct}%` : undefined,
    }),
  },
];

// Returns a LocalAnswer if the message matches a known direct pattern,
// otherwise null (caller falls through to AI unchanged).
export function matchLocalRule(message: string, facts: BriefingFacts): LocalAnswer | null {
  for (const rule of RULES) {
    if (rule.pattern.test(message)) return rule.answer(facts);
  }
  return null;
}

const CUSTOMER_360_PATTERN = /customer ?360|360|بروفايل|ملف العميل الكامل/i;

// Customer 360 — a multi-section restatement of CustomerBriefingResult's
// own fields, checked separately from matchLocalRule (single answer only)
// because it needs LocalSection[]. Per explicit instruction: every line
// here must be a field that genuinely exists on BriefingFacts already —
// no invented classification (e.g. "Good"/"Warning"), no computed
// threshold, no derived "days overdue" figure that isn't already provided
// by the briefing computation. A section with nothing real to show is
// omitted by renderLocalSections, not filled with a placeholder.
export function matchCustomer360(message: string, facts: BriefingFacts): string | null {
  if (!CUSTOMER_360_PATTERN.test(message)) return null;

  const identity: LocalSection = {
    heading: "بيانات العميل",
    lines: [`العميل: ${facts.customerName}`, `الكود: ${facts.customerCode}`, `الفترة: ${facts.period.from} إلى ${facts.period.to}`],
  };

  const performance: LocalSection = {
    heading: "ملخص الأداء",
    lines: [
      `إجمالي المبيعات: ${fmt(facts.sales.total)} ج.م`,
      `عدد الفواتير: ${facts.sales.invoiceCount}`,
      ...(facts.sales.trendPct !== null ? [`الاتجاه: ${facts.sales.trendPct >= 0 ? "+" : ""}${facts.sales.trendPct}%`] : []),
    ],
  };

  const products: LocalSection = {
    heading: "أكثر الأصناف مبيعًا",
    lines: facts.topProducts.map((p, i) => `${i + 1}. ${p.productName} — ${fmt(p.value)} ج.م (كمية: ${fmt(p.qty)})`),
  };

  const collections: LocalSection = {
    heading: "حالة التحصيل",
    lines: [
      `المحصّل: ${fmt(facts.collections.collected)} ج.م`,
      `المعلّق: ${fmt(facts.collections.pending)} ج.م`,
      `المرتد: ${fmt(facts.collections.bounced)} ج.م`,
      ...(facts.collections.oldestPendingDueDate ? [`أقدم استحقاق معلّق: ${facts.collections.oldestPendingDueDate}`] : []),
    ],
  };

  const returns: LocalSection = {
    heading: "المرتجعات",
    lines: [`إجمالي المرتجعات: ${fmt(facts.returns.total)} ج.م`, ...(facts.returns.rate !== null ? [`نسبة المرتجعات: ${facts.returns.rate}%`] : [])],
  };

  const missing: LocalSection = {
    heading: "منتجات ناقصة عند العميل",
    lines: facts.missingProducts.map((p) => p.productName),
  };

  const decision: LocalSection = {
    heading: "أهم قرار للزيارة",
    lines: [facts.topOpportunity, facts.suggestedGoal].filter((s) => s.trim() !== ""),
  };

  return renderLocalSections(`Customer 360 — ${facts.customerName}`, [identity, performance, products, collections, returns, missing, decision]);
}
