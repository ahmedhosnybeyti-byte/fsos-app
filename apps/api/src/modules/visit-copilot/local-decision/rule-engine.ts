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

import type { LocalAnswer } from "./template-builder";

// Minimal shape this engine needs — matches CustomerBriefingResult's
// relevant fields without importing the full VisitCopilotService type
// (keeps this file testable/standalone per FDA's Engine Independence rule).
export interface BriefingFacts {
  customerName: string;
  collections: { collected: number; pending: number; bounced: number; oldestPendingDueDate: string | null };
  topOpportunity: string;
  suggestedGoal: string;
  missingProducts: { productName: string }[];
  topProducts: { productName: string; value: number }[];
  sales: { total: number; trendPct: number | null };
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
