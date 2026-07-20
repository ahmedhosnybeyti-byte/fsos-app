import { Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import { FilesService } from "../files/files.service";
import { normalizeHeader, type DatasetRow, type HierarchyFilterUser } from "../files/dataset-query.util";
import { ENTITY_DATASET_TYPE_MAP } from "./excel-entity-provider.mapping";

// Roles this route-based restriction ever narrows. SUPER_ADMIN/COMPANY_ADMIN
// are unrestricted (matches applyHierarchyFilter's own null-means-unfiltered
// contract).
const ROUTE_SCOPED_ROLES = new Set(["SALES_REP", "SUPERVISOR", "MANAGER"]);

// The three Routes columns that assign an employee to a route (official
// template field names — Routes.SalesRepID/SupervisorID/ManagerID, all FKs
// to Employees.EmployeeID).
const ROUTE_ASSIGNMENT_COLUMNS = ["SalesRepID", "SupervisorID", "ManagerID"] as const;

/**
 * Canonical (fixed-schema) Route -> Employee hierarchy resolution — the
 * ONLY row-level access-scoping mechanism (post-ADR-001; no manual
 * configuration exists anywhere). Shared by every dataset reader:
 * ExcelDatasetEntityProvider, the Custom GPT Action, Route Planning's
 * legacy endpoint, and Targets import.
 *
 * Configurable-hierarchy model (2026-07-19, replacing the earlier
 * role-name-driven branching): a user's visibility is computed purely from
 * the company's own Employees/Routes data, with NO assumption about which
 * management levels exist or what they're called —
 *
 *   allowed routes = routes assigned DIRECTLY to me (any of
 *   SalesRepID/SupervisorID/ManagerID) ∪ routes assigned to anyone in my
 *   transitive reporting subtree (Employees.DirectManagerID chain,
 *   followed all the way down).
 *
 * So a Region Manager sees everything under them because every Branch/Sales
 * Manager in the region reports up to them via DirectManagerID; a company
 * WITHOUT a Branch Manager level simply has a shorter chain — nothing in
 * code enumerates levels. Role titles in the Employees sheet ("Region
 * Manager", "Branch Manager", ...) affect only account provisioning
 * (which RoleCode a created user gets), never scope.
 *
 * Fail-closed: a scoped-role user with no Employees row matching their
 * email still gets their own email matched against the Routes assignment
 * columns directly (covers companies whose Routes hold emails instead of
 * employee codes), and otherwise sees nothing — never everything.
 */
@Injectable()
export class CanonicalHierarchyResolverService {
  constructor(private readonly filesService: FilesService) {}

  // Returns the set of Route IDs (lowercased/trimmed) this user may see, or
  // null if the role isn't route-scoped (caller treats null as "no
  // route-based restriction applies" — see applyHierarchyFilter).
  async resolveAllowedRouteIds(companyId: string, user: HierarchyFilterUser): Promise<Set<string> | null> {
    if (!ROUTE_SCOPED_ROLES.has(user.roleCode)) return null;

    const routes = await this.fetchRawEntityRows("Routes", companyId);
    if (!routes) return new Set();

    const employees = await this.fetchRawEntityRows("Employees", companyId);

    // ---- 1. Build my identifier set: my email + my EmployeeID(s) + the
    // EmployeeIDs and emails of everyone in my transitive reporting
    // subtree (Employees.DirectManagerID). ----
    const myEmail = user.email.trim().toLowerCase();
    const identifiers = new Set<string>([myEmail]);

    if (employees) {
      const empIdCol = findHeader(employees.headers, "EmployeeID");
      const empEmailCol = findHeader(employees.headers, "Email");
      const empManagerCol = findHeader(employees.headers, "DirectManagerID");

      if (empIdCol && empEmailCol) {
        // children: managerId -> direct reports' EmployeeIDs
        const children = new Map<string, string[]>();
        const emailById = new Map<string, string>();
        const myIds: string[] = [];

        for (const row of employees.rows) {
          const id = cell(row[empIdCol]);
          if (!id) continue;
          const email = cell(row[empEmailCol]);
          if (email) emailById.set(id, email);
          if (email === myEmail) myIds.push(id);
          if (empManagerCol) {
            const managerId = cell(row[empManagerCol]);
            if (managerId) {
              const list = children.get(managerId) ?? [];
              list.push(id);
              children.set(managerId, list);
            }
          }
        }

        // BFS down the reporting tree from my own EmployeeID(s), with a
        // visited-set so a cyclic DirectManagerID chain in messy data can
        // never hang the request.
        const visited = new Set<string>(myIds);
        const queue = [...myIds];
        while (queue.length > 0) {
          const current = queue.shift()!;
          identifiers.add(current);
          const email = emailById.get(current);
          if (email) identifiers.add(email);
          for (const child of children.get(current) ?? []) {
            if (!visited.has(child)) {
              visited.add(child);
              queue.push(child);
            }
          }
        }
      }
    }

    // ---- 2. Allowed routes = routes whose SalesRepID/SupervisorID/
    // ManagerID matches any identifier in my subtree. ----
    const routeIdCol = findHeader(routes.headers, "RouteID");
    if (!routeIdCol) return new Set();
    const assignmentCols = ROUTE_ASSIGNMENT_COLUMNS.map((c) => findHeader(routes.headers, c)).filter((c): c is string => !!c);

    const allowed = new Set<string>();
    for (const row of routes.rows) {
      const matches = assignmentCols.some((col) => {
        const v = cell(row[col]);
        return !!v && identifiers.has(v);
      });
      if (matches) {
        const id = cell(row[routeIdCol]);
        if (id) allowed.add(id);
      }
    }
    return allowed;
  }

  // Raw (unfiltered) rows+headers for one Canonical Dataset — same
  // list/download/parse steps ExcelDatasetEntityProvider.getRecords uses,
  // without any hierarchy-filter step, since resolveAllowedRouteIds is what
  // computes hierarchy visibility in the first place (filtering Routes/
  // Employees themselves by it would be circular).
  private async fetchRawEntityRows(entityName: string, companyId: string): Promise<{ rows: DatasetRow[]; headers: string[] } | null> {
    const mapping = ENTITY_DATASET_TYPE_MAP[entityName];
    if (!mapping) return null;

    let allFiles;
    try {
      allFiles = await this.filesService.listConfirmedActiveForCompany(companyId);
    } catch {
      return null;
    }

    const matchingFiles = allFiles.filter((f: { datasetType: string }) => f.datasetType === mapping.datasetType);
    if (matchingFiles.length === 0) return null;

    let mergedRows: DatasetRow[] = [];
    let headers: string[] = [];
    for (const file of matchingFiles) {
      try {
        const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
        // 2026-07-20: same fix as ExcelDatasetEntityProvider.parseDatasetFromFiles
        // — this path is UNCACHED and runs on every single getRecords() call
        // for SALES_REP/SUPERVISOR/MANAGER users (resolveAllowedRouteIds is
        // called fresh each time, unlike the parsed-dataset cache). Without
        // `sheets`, every call to resolve Routes+Employees would re-parse
        // the entire multi-sheet batch workbook (measured ~150s for a real
        // 40MB/530k-row seed file) on every request from a scoped role —
        // restricting to the needed sheet(s) is what makes this path viable
        // at all, not just faster.
        const workbook = XLSX.read(buffer, {
          type: "buffer",
          cellDates: true,
          sheets: Array.from(new Set([file.sheetIndex, 0])),
        });
        const sheetName = workbook.SheetNames[file.sheetIndex] ?? workbook.SheetNames[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
        const rows = (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as DatasetRow[];
        const fileHeaders = rows.length > 0 ? Object.keys(rows[0] as object) : [];
        for (const h of fileHeaders) if (!headers.includes(h)) headers.push(h);
        mergedRows = mergedRows.concat(rows);
      } catch {
        // Best-effort internal lookup — skip a broken file, keep going,
        // same as ExcelDatasetEntityProvider.getRecords' own loop.
      }
    }
    return { rows: mergedRows, headers };
  }
}

// Case/spacing-tolerant header resolution (same normalizeHeader convention
// as every other reader in this codebase).
function findHeader(headers: string[], official: string): string | null {
  return headers.find((h) => normalizeHeader(h) === normalizeHeader(official)) ?? null;
}

function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  return s === "" ? null : s;
}
