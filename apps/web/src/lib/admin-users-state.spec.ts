import { strict as assert } from "node:assert";
import test from "node:test";
import { canStartUserMutation, getAdminUsersViewState, getPageAfterUserFilterChange } from "./admin-users-state";

test("derives loading, error, empty, and filtered no-results states", () => {
  assert.equal(getAdminUsersViewState({ isLoading: false, isError: false, hasFilters: false }), "select-company");
  assert.equal(getAdminUsersViewState({ companyId: "c", isLoading: true, isError: false, hasFilters: false }), "loading");
  assert.equal(getAdminUsersViewState({ companyId: "c", isLoading: false, isError: true, hasFilters: false }), "error");
  assert.equal(getAdminUsersViewState({ companyId: "c", isLoading: false, isError: false, total: 0, hasFilters: false }), "empty");
  assert.equal(getAdminUsersViewState({ companyId: "c", isLoading: false, isError: false, total: 0, hasFilters: true }), "no-results");
});

test("blocks a second mutation while the first is pending", () => {
  assert.equal(canStartUserMutation(false), true);
  assert.equal(canStartUserMutation(true), false);
});
test("resets pagination when a user filter changes", () => {
  assert.equal(getPageAfterUserFilterChange(), 1);
});