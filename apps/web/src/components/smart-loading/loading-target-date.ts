// Match the existing API calendar and its tomorrow-or-later contract.
// Browser/UTC midnight must not restore a now-expired loading day.
export function minimumLoadingTargetDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(value => value.type === type)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day") + 1)).toISOString().slice(0, 10);
}

export function resolveLoadingTargetDate(saved: unknown, now = new Date()): string {
  const minimum = minimumLoadingTargetDate(now);
  if (typeof saved !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(saved) || saved < minimum) return minimum;
  const parsed = new Date(`${saved}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === saved ? saved : minimum;
}
