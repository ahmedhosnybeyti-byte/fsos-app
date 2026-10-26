import assert from "node:assert/strict";
import test from "node:test";
import { minimumLoadingTargetDate, resolveLoadingTargetDate } from "./loading-target-date";

test("incident: a saved Oct 25 expires after Riyadh midnight while UTC is still Oct 24", () => {
  const now = new Date("2026-10-24T22:40:04Z");
  assert.equal(minimumLoadingTargetDate(now), "2026-10-26");
  assert.equal(resolveLoadingTargetDate("2026-10-25", now), "2026-10-26");
});
test("the same saved day is retained before Riyadh midnight and rolls forward after it", () => {
  assert.equal(resolveLoadingTargetDate("2026-10-25", new Date("2026-10-24T20:59:59Z")), "2026-10-25");
  assert.equal(resolveLoadingTargetDate("2026-10-25", new Date("2026-10-24T21:00:00Z")), "2026-10-26");
});
test("valid future work remains on its selected day", () => {
  assert.equal(resolveLoadingTargetDate("2026-11-03", new Date("2026-10-24T22:40:04Z")), "2026-11-03");
});
test("invalid, absent and malformed saved dates cannot reach the API", () => {
  const now = new Date("2026-10-24T22:40:04Z");
  for (const saved of [undefined, null, "", "2026-02-30", "2026-11-31", "2026-10-25T00:00:00Z", {}, 20261026]) {
    assert.equal(resolveLoadingTargetDate(saved, now), "2026-10-26");
  }
});
test("the API calendar rolls month/year boundaries without depending on the browser timezone", () => {
  assert.equal(minimumLoadingTargetDate(new Date("2026-12-31T21:30:00Z")), "2027-01-02");
  assert.equal(minimumLoadingTargetDate(new Date("2028-02-28T21:30:00Z")), "2028-03-01");
});
