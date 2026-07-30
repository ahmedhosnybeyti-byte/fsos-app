import { strict as assert } from "node:assert";
import test from "node:test";
import { applyRemovedSelections, buildFsos360QueryRequest, cityOptions, nextHierarchyFilters, regionOptions } from "./fsos-360-filter-state";

const hierarchy = [
  { value: "region-east", label: "East", level: "region" as const },
  { value: "region-west", label: "West", level: "region" as const },
  { value: "city-a", label: "City A", level: "city" as const, parentRegionId: "region-east" },
  { value: "city-b", label: "City B", level: "city" as const, parentRegionId: "region-west" },
];

test("FSOS 360 separates hierarchy options and preserves filter payloads", () => {
  assert.deepEqual(regionOptions(hierarchy).map((option) => option.value), ["region-east", "region-west"]);
  assert.deepEqual(cityOptions(hierarchy, "region-east").map((option) => option.value), ["city-a"]);

  const afterRegion = nextHierarchyFilters({ branchIds: ["branch-1"] }, "regionIds", "region-east");
  assert.deepEqual(buildFsos360QueryRequest({} as never, afterRegion).filters, { regionIds: ["region-east"] });

  const afterCity = nextHierarchyFilters(afterRegion, "cityValues", "city-a");
  assert.deepEqual(buildFsos360QueryRequest({} as never, afterCity).filters, { regionIds: ["region-east"], cityValues: ["city-a"] });
  assert.equal(applyRemovedSelections(afterCity, {}), afterCity);
});