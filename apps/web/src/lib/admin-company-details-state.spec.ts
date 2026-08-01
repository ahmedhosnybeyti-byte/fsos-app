import { strict as assert } from "node:assert";
import test from "node:test";
import { canSubmitCompanyDetails, getCompanyDetailsViewState } from "./admin-company-details-state";

test("company details selects the correct loading/error/ready view", () => {
  assert.equal(getCompanyDetailsViewState({ isLoading: true, isError: false, hasData: false }), "loading");
  assert.equal(getCompanyDetailsViewState({ isLoading: false, isError: true, hasData: false }), "error");
  assert.equal(getCompanyDetailsViewState({ isLoading: false, isError: false, hasData: true }), "ready");
});

test("company details blocks a second save while pending", () => {
  assert.equal(canSubmitCompanyDetails(false), true);
  assert.equal(canSubmitCompanyDetails(true), false);
});