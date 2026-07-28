// FDA Local Decision Layer — Time Context Parser (generic, platform-level).
//
// Task Brief: "Time Context Parser + Intent Dispatcher" (2026-07-26).
//
// Same boundary discipline as entity-resolution.ts: this file knows nothing
// about Intents, Business Services, or entities — it only turns a fixed set
// of Arabic time phrases into a concrete {start, end} date range, or
// reports "unresolved" if the message doesn't contain one of them. No
// guessing, no defaulting to "this month" or any other assumption — an
// unresolved time context must be treated by callers exactly like an
// ambiguous Entity Resolution outcome: stop and ask, never hand a guess to
// AI or to a Business Service.
//
// Supported phrases (fixed set, per Task Brief — do not silently expand):
//   اليوم (today), أمس (yesterday), هذا الأسبوع (this week),
//   هذا الشهر (this month), الشهر الماضي (last month),
//   هذا الربع (this quarter), هذه السنة (this year),
//   and an explicit dd/mm/yyyy–dd/mm/yyyy range.
//
// Dates are produced as ISO "YYYY-MM-DD" strings (date-only, no time
// component) since every date field this parser's callers will filter by
// (InvoiceDate, CollectionDate, VisitDate, ReturnDate...) is itself a plain
// date per the import templates — matches the existing convention already
// used elsewhere in this codebase (assistant.service.ts's `today` line).

export interface DateRange {
  start: string; // ISO YYYY-MM-DD, inclusive
  end: string; // ISO YYYY-MM-DD, inclusive
}

export type TimeContextOutcome = { status: "resolved"; range: DateRange; label: string } | { status: "unresolved" };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  // Saturday-start week — the convention already used by Sales Calendar /
  // SGI recompute windows elsewhere in this codebase (Egypt/MENA work week).
  const day = d.getDay(); // 0=Sunday..6=Saturday
  const diff = (day + 1) % 7; // days since most recent Saturday
  const s = new Date(d);
  s.setDate(d.getDate() - diff);
  return startOfDay(s);
}

function endOfWeek(start: Date): Date {
  const e = new Date(start);
  e.setDate(start.getDate() + 6);
  return e;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfQuarter(d: Date): Date {
  const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), qStartMonth, 1);
}

function endOfQuarter(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31);
}

// Explicit date range pattern: dd/mm/yyyy or dd-mm-yyyy, two of them
// separated by "الى"/"إلى"/"-"/"to". Kept intentionally narrow — this is
// not a general date grammar, just the one unambiguous shape worth
// matching without AI. Anything else (relative phrases like "الأسبوع
// اللي فات", "من شهرين", partial dates) is deliberately NOT parsed here —
// per the Task Brief's "no guessing" rule, those fall through to
// unresolved rather than being approximated.
const EXPLICIT_DATE = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g;

function tryExplicitRange(message: string): TimeContextOutcome | null {
  const matches = [...message.matchAll(EXPLICIT_DATE)];
  if (matches.length < 2) return null;

  const parseOne = (m: RegExpMatchArray): Date | null => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    // Reject invalid dates (e.g. 31/02/2026) — Date silently rolls over,
    // so verify the round-trip matches what was typed.
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d;
  };

  const firstMatch = matches[0];
  const secondMatch = matches[1];
  if (!firstMatch || !secondMatch) return null;

  const first = parseOne(firstMatch);
  const second = parseOne(secondMatch);
  if (!first || !second) return null;

  const [start, end] = first.getTime() <= second.getTime() ? [first, second] : [second, first];
  return {
    status: "resolved",
    range: { start: toIsoDate(start), end: toIsoDate(end) },
    label: `${toIsoDate(start)} إلى ${toIsoDate(end)}`,
  };
}

// Fixed-phrase matchers, checked in this order (most specific first so
// "الشهر الماضي" doesn't get caught by a looser "الشهر" check, etc).
// Each entry's pattern is matched with a simple `.includes` test — no
// regex needed for fixed literal phrases, consistent with the Rule
// Engine's "exact keyword/pattern matching only" philosophy.
function tryFixedPhrase(message: string, now: Date): TimeContextOutcome | null {
  const m = message;

  if (m.includes("أمس") || m.includes("امبارح")) {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const d = startOfDay(y);
    return { status: "resolved", range: { start: toIsoDate(d), end: toIsoDate(d) }, label: "أمس" };
  }

  if (m.includes("اليوم") || m.includes("النهاردة") || m.includes("النهارده")) {
    const d = startOfDay(now);
    return { status: "resolved", range: { start: toIsoDate(d), end: toIsoDate(d) }, label: "اليوم" };
  }

  if (m.includes("هذا الأسبوع") || m.includes("الأسبوع ده") || m.includes("الاسبوع ده")) {
    const s = startOfWeek(now);
    const e = endOfWeek(s);
    return { status: "resolved", range: { start: toIsoDate(s), end: toIsoDate(e) }, label: "هذا الأسبوع" };
  }

  if (m.includes("الشهر الماضي") || m.includes("الشهر اللي فات") || m.includes("الشهر السابق")) {
    const prevMonthAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const s = startOfMonth(prevMonthAnchor);
    const e = endOfMonth(prevMonthAnchor);
    return { status: "resolved", range: { start: toIsoDate(s), end: toIsoDate(e) }, label: "الشهر الماضي" };
  }

  if (m.includes("هذا الشهر") || m.includes("الشهر ده")) {
    const s = startOfMonth(now);
    const e = endOfMonth(now);
    return { status: "resolved", range: { start: toIsoDate(s), end: toIsoDate(e) }, label: "هذا الشهر" };
  }

  if (m.includes("هذا الربع") || m.includes("الربع ده")) {
    const s = startOfQuarter(now);
    const e = endOfQuarter(s);
    return { status: "resolved", range: { start: toIsoDate(s), end: toIsoDate(e) }, label: "هذا الربع" };
  }

  if (m.includes("هذه السنة") || m.includes("السنة دي") || m.includes("هذا العام")) {
    const s = startOfYear(now);
    const e = endOfYear(now);
    return { status: "resolved", range: { start: toIsoDate(s), end: toIsoDate(e) }, label: "هذه السنة" };
  }

  return null;
}

// Entry point. `now` is injectable for testability; callers pass real
// current time in production (same pattern as assistant.service.ts's own
// `today` line — no new clock abstraction introduced).
export function parseTimeContext(message: string, now: Date = new Date()): TimeContextOutcome {
  const explicit = tryExplicitRange(message);
  if (explicit) return explicit;

  const fixed = tryFixedPhrase(message, now);
  if (fixed) return fixed;

  return { status: "unresolved" };
}
