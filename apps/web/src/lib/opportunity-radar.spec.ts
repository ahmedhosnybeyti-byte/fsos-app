import { strict as assert } from "node:assert";
import test from "node:test";
import { eventProximity, opportunityLocation, opportunityMapLocation, primaryContact, safeExternalUrl } from "./opportunity-radar";

const marketOpportunity = { city: "الرياض", region: "منطقة الرياض", country: "السعودية", location: null, whatsapp: null, email: null, phone: "+966 11 000 0000", contactUrl: null };
const rawItem = { marketOpportunity };
const item = rawItem as never;

test("Opportunity Radar labels a generic published phone without implying a procurement owner", () => {
  assert.deepEqual(primaryContact(item), { label: "هاتف عام معلن", value: "+966 11 000 0000", href: "tel:+966 11 000 0000" });
  assert.equal(opportunityLocation(item), "الرياض، منطقة الرياض، السعودية");
});

test("Opportunity Radar accepts only HTTP(S) external links", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("https://example.test/source"), "https://example.test/source");
});

test("Opportunity Radar shows deterministic 14-day and 7-day event proximity labels", () => {
  const now = new Date("2026-10-16T00:00:00.000Z");
  assert.deepEqual(eventProximity("2026-10-30T00:00:00.000Z", now), { label: "الفعالية خلال 14 يومًا", urgent: false });
  assert.deepEqual(eventProximity("2026-10-23T00:00:00.000Z", now), { label: "الفعالية خلال 7 أيام", urgent: true });
  assert.equal(eventProximity("2026-11-15T00:00:00.000Z", now), null);
});

test("Opportunity Radar opens Maps only for a source-backed precise location", () => {
  const precise = opportunityMapLocation({ ...rawItem, marketOpportunity: { ...marketOpportunity, location: "مركز الرياض للمعارض" } } as never);
  assert.equal(precise.precise, true);
  assert.match(precise.href ?? "", /^https:\/\/www\.google\.com\/maps\/search/);
  const cityOnly = opportunityMapLocation(item as never);
  assert.equal(cityOnly.precise, false);
  assert.equal(cityOnly.href, null);
});
