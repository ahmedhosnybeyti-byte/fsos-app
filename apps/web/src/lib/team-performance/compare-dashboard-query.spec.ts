import { strict as assert } from "node:assert";
import test from "node:test";
import { compareDashboardQuery } from "./compare-dashboard-query";

test("compare dashboard query preserves the focus-card entity scope and applied period", () => {
  const period = { dateFrom: "2026-08-01", dateTo: "2026-08-16", comparisonFrom: "2026-07-01", comparisonTo: "2026-07-16" };
  const query = compareDashboardQuery("previous-month", "rep-a@example.com", ["R-1", "R-2"], period);

  assert.deepEqual(query.period, period);
  assert.deepEqual(query.queryKey, ["team-compare", "previous-month", "rep-a@example.com", "R-1,R-2", "2026-08-01", "2026-08-16", "2026-07-01", "2026-07-16"]);
});
