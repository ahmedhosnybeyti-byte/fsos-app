import { strict as assert } from "node:assert";
import test from "node:test";
import { geoAliases, geoKey, groupGeoOptions } from "./opportunity-geo";

test("Opportunity geography merges only explicit Arabic and English aliases", () => {
  assert.equal(geoKey("city", "جدة"), "jeddah");
  assert.equal(geoKey("city", "JEDDAH"), "jeddah");
  assert.equal(geoKey("city", "الجبيل"), "jubail");
  assert.notEqual(geoKey("city", "الجبيل"), geoKey("city", "الخبر"));
  assert.deepEqual(groupGeoOptions("city", ["جدة", "Jeddah", "الخبر"]).map((item) => item.key).sort(), ["jeddah", "khobar"]);
});

test("Unknown geography remains an exact independent value", () => {
  const key = geoKey("city", "مدينة جديدة 1");
  assert.ok(key.startsWith("raw:"));
  assert.deepEqual(geoAliases("city", key), ["مدينة جديدة 1"]);
  assert.notEqual(key, geoKey("city", "مدينة جديدة 2"));
});
