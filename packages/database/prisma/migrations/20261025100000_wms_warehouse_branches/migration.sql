-- Request-routing configuration only. No role grants, tenant activation,
-- warehouse/branch creation or inventory/custody mutation.
CREATE TABLE wms_warehouse_branches (
  company_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  -- Stable official BranchID from the company's current RIE Branches data.
  -- Canonical projection row IDs change on ingestion; they are not master IDs.
  -- Service writes validate the branch, and admission revalidates current state.
  branch_id TEXT NOT NULL CHECK (length(branch_id) BETWEEN 1 AND 100 AND branch_id = btrim(branch_id)),
  created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  PRIMARY KEY (company_id, warehouse_id, branch_id),
  FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses(company_id, id) ON DELETE RESTRICT
);
CREATE INDEX wms_warehouse_branches_company_branch_warehouse
  ON wms_warehouse_branches(company_id, branch_id, warehouse_id);

-- Bounded, tenant-scoped identity/branch probes; no facts are loaded into Node.
CREATE INDEX rie_employees_company_email_loading_request
  ON rie_canonical_entity_rows(company_id, (lower(btrim(COALESCE(data->>'Email','')))))
  WHERE entity_name = 'Employees';
CREATE INDEX rie_branches_company_branch_loading_request
  ON rie_canonical_entity_rows(company_id, (btrim(COALESCE(data->>'BranchID',''))))
  WHERE entity_name = 'Branches';
