import { z } from "zod";

// Visit Efficiency Map (GVE catalog, Part 20.2): "المندوب بيلف صح؟" — for
// each rep-day, sorts that rep's visits into a sequence and measures the
// straight-line distance between consecutive stops. A big jump between two
// consecutive visits (compared to the rest of that day's stops) signals
// backtracking/zigzagging — an inefficient route, not necessarily a bad
// rep. Deliberately NOT true route optimization (that's Route Planning's
// job, ahead of the day) — this is a retrospective diagnostic over actual
// visit logs. Sequencing uses `timeColumn` if mapped; otherwise falls back
// to each row's original order within the file for that rep-day, which is
// a real approximation (documented, not hidden) since most visit-log
// exports are already chronological but this doesn't verify that.
// Migration #6 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. repColumn/dateColumn/customerIdColumn/timeColumn and the
// direct-vs-join coordinate-source pair are gone: the Canonical Visits
// entity already fixes those fields (CustomerCode, VisitDate, CheckInTime,
// Latitude/Longitude) — see visit-efficiency.service.ts for how rep
// identity is derived (Visits.RouteID -> Routes.SalesRepID -> Employees,
// REL-DER-002 in the Relationship Registry) and how coordinates fall back
// to the joined Customer record when Visits itself has none. scopeField is
// a Customer attribute (same enum used by Heat Map/Route Planning/Geo
// Intelligence) applied via Visits.CustomerCode -> Customers.
export const visitEfficiencyScopeFieldSchema = z.enum(["RouteID", "City", "CustomerClass", "Channel"]);
export type VisitEfficiencyScopeField = z.infer<typeof visitEfficiencyScopeFieldSchema>;

export const visitEfficiencyRieQuerySchema = z.object({
  scopeField: visitEfficiencyScopeFieldSchema.optional(),
  scopeValues: z.array(z.string().min(1).max(200)).max(300).optional(),
  dateFrom: z.string().min(1).max(50).optional(),
  dateTo: z.string().min(1).max(50).optional(),
});
export type VisitEfficiencyRieQueryInput = z.infer<typeof visitEfficiencyRieQuerySchema>;

export const visitEfficiencyScopeValuesQuerySchema = z.object({ scopeField: visitEfficiencyScopeFieldSchema });
export type VisitEfficiencyScopeValuesQueryInput = z.infer<typeof visitEfficiencyScopeValuesQuerySchema>;

export const visitEfficiencyValuesResultSchema = z.object({ values: z.array(z.string()) });
export type VisitEfficiencyValuesResult = z.infer<typeof visitEfficiencyValuesResultSchema>;

export const visitEfficiencyPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  value: z.number(), // km from the previous visit in that rep-day's sequence
  // Added for the rep-visibility map filter and the expandable per-rep
  // detail rows / Excel export — the map itself only reads lat/lon/value,
  // these two just ride along on the same point so the frontend doesn't
  // need a second lookup structure.
  rep: z.string(),
  dateKey: z.string(),
});

export const visitEfficiencyRepSummarySchema = z.object({
  rep: z.string(),
  visitDays: z.number(),
  totalVisits: z.number(),
  totalDistanceKm: z.number(),
  avgDistanceKmPerVisit: z.number(),
});

export const visitEfficiencyResultSchema = z.object({
  usedVisits: z.number(),
  excludedNoCoordinates: z.number(),
  excludedSingleVisitDays: z.number(),
  timeColumnUsed: z.boolean(), // false = fell back to row order within the file
  points: z.array(visitEfficiencyPointSchema),
  repSummaries: z.array(visitEfficiencyRepSummarySchema),
});
export type VisitEfficiencyResult = z.infer<typeof visitEfficiencyResultSchema>;
