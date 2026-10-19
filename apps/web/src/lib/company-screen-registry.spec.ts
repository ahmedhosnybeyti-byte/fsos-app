import { strict as assert } from "node:assert";
import test from "node:test";
import { buildCompanyNavItems } from "./company-screen-registry";

const labels = new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>;
const t = (key: string) => labels[key] ?? key;
const groupLabels = { data: "Data", aiInsights: "AI", customersTerritory: "Customers", team: "Team", system: "System" };

test("Visits remains navigable for company and hierarchy management roles", () => {
  for (const roleCode of ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"]) {
    const nav = buildCompanyNavItems({ featureAccess: {}, t: t as never, groupLabels, roleCode });
    assert.equal(nav.some((item) => item.href === "/dashboard/visit-efficiency"), true, `${roleCode} should retain Visits navigation`);
  }
});

test("Opportunity Radar is present for every operational company role", () => {
  for (const roleCode of ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"]) {
    const nav = buildCompanyNavItems({ featureAccess: {}, t: t as never, groupLabels, roleCode });
    assert.equal(nav.some((item) => item.href === "/dashboard/opportunity-radar"), true, roleCode);
  }
});

test("SFA Setup reuses the registry and stays hidden unless explicitly enabled for an admin", () => {
  for (const roleCode of ["COMPANY_ADMIN", "MANAGER", "SUPERVISOR", "SALES_REP"]) {
    assert.equal(buildCompanyNavItems({ featureAccess: {}, t: t as never, groupLabels, roleCode }).some((item) => item.featureKey === "sfa-setup"), false);
    const items = buildCompanyNavItems({ featureAccess: { "sfa-setup": "ENABLED" }, t: t as never, groupLabels, roleCode }).filter((item) => item.featureKey === "sfa-setup");
    assert.equal(items.length, roleCode === "COMPANY_ADMIN" ? 1 : 0);
    if (items[0]) assert.equal(items[0].href, "/sfa/setup");
  }
});
