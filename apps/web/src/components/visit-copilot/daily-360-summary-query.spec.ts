import { strict as assert } from "node:assert";
import test from "node:test";
import { daily360SummaryQuery } from "./daily-360-summary-query";

test("changing selectedDate changes the Daily 360 key and request", () => {
  const july = daily360SummaryQuery({ period: "3m", selectedDate: "2026-07-31" });
  const august = daily360SummaryQuery({ period: "3m", selectedDate: "2026-08-01" });
  assert.notDeepEqual(july.queryKey, august.queryKey);
  assert.equal(july.request.date, "2026-07-31");
  assert.equal(august.request.date, "2026-08-01");
});