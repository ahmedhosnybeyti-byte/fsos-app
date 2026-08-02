import { strict as assert } from "node:assert";
import test from "node:test";
import { selectSgiRepStats } from "./sgi-rep-stats";

const repStats = {
  "rep-a@example.com": { salesActual: 1200, salesTarget: 2000, collectionActual: 500, activeCustomers: 4, topProducts: [] },
  "rep-b@example.com": { salesActual: 800, salesTarget: 1500, collectionActual: 300, activeCustomers: 3, topProducts: [] },
};

const repDirectory = [
  { email: "rep-a@example.com", name: "Rep A", supervisorEmail: "supervisor@example.com", supervisorName: "Supervisor" },
  { email: "rep-b@example.com", name: "Rep B", supervisorEmail: "supervisor@example.com", supervisorName: "Supervisor" },
];

test("SALES_REP selects only the current rep's statistics", () => {
  assert.deepEqual(selectSgiRepStats({ roleCode: "SALES_REP", currentUserEmail: "REP-A@example.com", repDirectory, repStats }), {
    state: "ready",
    salesActual: 1200,
    activeCustomers: 4,
    repCount: 1,
  });
});

test("SUPERVISOR aggregates direct team statistics only", () => {
  assert.deepEqual(selectSgiRepStats({ roleCode: "SUPERVISOR", currentUserEmail: "supervisor@example.com", repDirectory, repStats }), {
    state: "ready",
    salesActual: 2000,
    activeCustomers: 7,
    repCount: 2,
  });
});

test("MANAGER and COMPANY_ADMIN aggregate all available report statistics", () => {
  for (const roleCode of ["MANAGER", "COMPANY_ADMIN"]) {
    assert.deepEqual(selectSgiRepStats({ roleCode, currentUserEmail: null, repDirectory: [], repStats }), {
      state: "ready",
      salesActual: 2000,
      activeCustomers: 7,
      repCount: 2,
    });
  }
});

test("falls back clearly for missing email, empty team, and missing statistics", () => {
  assert.equal(selectSgiRepStats({ roleCode: "SALES_REP", currentUserEmail: "", repDirectory, repStats }).state, "missing-current-user-email");
  assert.equal(selectSgiRepStats({ roleCode: "SUPERVISOR", currentUserEmail: "nobody@example.com", repDirectory, repStats }).state, "empty-team");
  assert.equal(selectSgiRepStats({ roleCode: "SALES_REP", currentUserEmail: "rep-a@example.com", repDirectory, repStats: {} }).state, "no-rep-stats");
});
