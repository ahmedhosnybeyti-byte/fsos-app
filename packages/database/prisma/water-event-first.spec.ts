import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  candidateExternalKey,
  candidateFingerprint,
  exactCandidateMatch,
  opportunityLocationKind,
  reviewedCandidateMatch,
  summarizeWaterEventManifest,
  validateWaterEventManifest,
  waterEventPriority,
  type WaterEventManifest,
} from "./water-event-first";

const manifestPath = resolve(__dirname, "data/water-event-first-20261016.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as WaterEventManifest;

test("Event-First manifest accounts for every workbook candidate exactly once", () => {
  validateWaterEventManifest(manifest);
  assert.deepEqual(summarizeWaterEventManifest(manifest), {
    total: 64,
    activeAdditions: 13,
    candidateAdditions: 46,
    verifiedDuplicates: 2,
    trustedHoldUpdates: 1,
    needsVerification: 45,
    needsEndDateReview: 6,
    heldWithoutImport: 1,
    expiredOrConflicting: 1,
    counts: {
      ADD_VERIFIED: 13, DUPLICATE_VERIFIED: 2, UPDATE_EXISTING_HOLD: 1,
      NEEDS_SOURCE_VERIFICATION: 39, NEEDS_END_DATE_REVIEW: 6,
      HOLD_POSTPONED: 1, HOLD_RECHECK: 1, EXPIRED_SOURCE_CONFLICT: 1,
    },
  });
});

test("Event-First treats workbook Maps SEARCH links as non-precise", () => {
  for (const candidate of manifest.candidates) {
    if (candidate.maps_link_kind?.toLowerCase().includes("search")) assert.equal(opportunityLocationKind(candidate), "SEARCH_ONLY");
  }
});

test("Event-First ranking puts sports before concerts and exhibitions", () => {
  const fixture = (event_category: string) => ({ ...manifest.candidates[0]!, event_category });
  assert.ok(waterEventPriority(fixture("رياضة")) > waterEventPriority(fixture("حفل")));
  assert.ok(waterEventPriority(fixture("حفل")) > waterEventPriority(fixture("معرض/مؤتمر")));
});

test("Event-First identity is stable and date/city/title matching is strict", () => {
  const candidate = manifest.candidates.find((row) => row.candidate_id === "EVT-005")!;
  assert.equal(candidateExternalKey(candidate), "water-event-first:evt-005");
  assert.equal(candidateFingerprint(candidate), candidateFingerprint({ ...candidate }));
  assert.equal(exactCandidateMatch(candidate, { id: "x", title: candidate.title, city: candidate.city, opportunityDate: `${candidate.start_date_raw}T00:00:00.000Z`, sourceUrl: candidate.event_source_url }), true);
  assert.equal(exactCandidateMatch(candidate, { id: "x", title: candidate.title, city: candidate.city, opportunityDate: "2027-10-21T00:00:00.000Z", sourceUrl: candidate.event_source_url }), false);
});

test("Event-First reviewed duplicate matching allows title variants only on the same date and city", () => {
  const candidate = manifest.candidates.find((row) => row.candidate_id === "EVT-027")!;
  assert.equal(reviewedCandidateMatch(candidate, { id: "x", title: "معرض ومؤتمر خدمات الحج", city: candidate.city, opportunityDate: `${candidate.start_date_raw}T00:00:00.000Z`, sourceUrl: "https://different.example/event" }), true);
  assert.equal(reviewedCandidateMatch(candidate, { id: "x", title: "معرض ومؤتمر خدمات الحج", city: "الرياض", opportunityDate: `${candidate.start_date_raw}T00:00:00.000Z`, sourceUrl: "https://different.example/event" }), false);
});
