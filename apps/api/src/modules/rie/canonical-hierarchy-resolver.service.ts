import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import * as XLSX from "xlsx";
import { FilesService } from "../files/files.service";
import { PrismaService } from "../../common/prisma";
import { normalizeHeader, type DatasetRow, type HierarchyFilterUser } from "../files/dataset-query.util";
import { ENTITY_DATASET_TYPE_MAP } from "./excel-entity-provider.mapping";
import { serializeExcelParse } from "../../common/excel-parse-queue";

// 2026-07-20: same root cause and fix as ExcelDatasetEntityProvider's
// parsed-dataset cache, applied here too. resolveAllowedRouteIds is called
// once per Canonical Entity read (Visit Copilot's daily-brief alone touches
// 8+ entities), and — unlike ExcelDatasetEntityProvider — had NO caching at
// all: every single call re-downloaded and re-parsed Routes and Employees
// from scratch. Measured live: with the sheet-restriction fix already in
// place, hierarchyResolve was STILL taking 30-90+ seconds PER CALL (up to
// 8 times in one request) because of this — the dominant remaining cost in
// a ~140s total request even after Invoice Items/Visits/etc. parses dropped
// to a few seconds each. Routes/Employees content doesn't depend on which
// user is asking, so it's safe to cache by (companyId, entityName) exactly
// like the sibling cache, invalidated the same way (signature of active
// file ids).
// 2026-07-20: bumped from 5 minutes to 5 hours — see FILE_BUFFER_CACHE_TTL_MS
// in files.service.ts for the full reasoning (correctness is signature-based,
// not time-based; this TTL only bounds idle memory).
const HIERARCHY_RAW_CACHE_TTL_MS = 5 * 60 * 60_000;
const HIERARCHY_RAW_CACHE_MAX_ENTRIES = 300;

interface HierarchyRawCacheEntry {
  signature: string;
  snapshot: Promise<{ rows: DatasetRow[]; headers: string[] } | null>;
  createdAt: number;
}

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
  private readonly logger = new Logger(CanonicalHierarchyResolverService.name);
  private readonly rawCache = new Map<string, HierarchyRawCacheEntry>();

  constructor(private readonly filesService: FilesService, private readonly prisma: PrismaService) {}

  // Returns the set of Route IDs (lowercased/trimmed) this user may see, or
  // null if the role isn't route-scoped (caller treats null as "no
  // route-based restriction applies" — see applyHierarchyFilter).
  async resolveAllowedRouteIds(companyId: string, user: HierarchyFilterUser): Promise<Set<string> | null> {
    if (!ROUTE_SCOPED_ROLES.has(user.roleCode)) return null;

    // An explicit operational assignment wins. Accounts provisioned from an
    // Employees upload predate UserRouteAssignment in existing companies,
    // though, so fall back to the same canonical Employees -> Routes mapping
    // used for every other scoped role. This remains fail-closed: an absent or
    // unmatched employee/route mapping still grants no data.
    if (user.roleCode === "SALES_REP") {
      const identity = await this.prisma.user.findFirst({ where: { companyId, email: user.email.trim().toLowerCase() }, select: { id: true } });
      const assignment = identity ? await this.prisma.userRouteAssignment.findFirst({ where: { companyId, userId: identity.id, endedAt: null }, select: { routeId: true } }) : null;
      if (assignment) return new Set([assignment.routeId.trim().toLowerCase()]);

      const [routes, employees] = await Promise.all([this.fetchRawEntityRows("Routes", companyId), this.fetchRawEntityRows("Employees", companyId)]);
      const routeIdCol = routes ? findHeader(routes.headers, "RouteID") : undefined;
      const salesRepCol = routes ? findHeader(routes.headers, "SalesRepID") : undefined;
      const employeeIdCol = employees ? findHeader(employees.headers, "EmployeeID") : undefined;
      const employeeEmailCol = employees ? findHeader(employees.headers, "Email") : undefined;
      if (routes && employees && routeIdCol && salesRepCol && employeeIdCol && employeeEmailCol) {
        const email = user.email.trim().toLowerCase();
        const employeeIds = new Set(employees.rows.filter((row) => cell(row[employeeEmailCol]) === email).map((row) => cell(row[employeeIdCol])).filter(Boolean));
        const allowed = new Set(routes.rows.filter((row) => employeeIds.has(cell(row[salesRepCol])) || cell(row[salesRepCol]) === email).map((row) => cell(row[routeIdCol])).filter((id): id is string => !!id));
        if (allowed.size > 0) return allowed;
      }
      throw new ForbiddenException({ code: "SALES_REP_ROUTE_NOT_ASSIGNED", message: "Sales representative route is not assigned", messageAr: "\u0644\u0645 \u064a\u062a\u0645 \u062a\u0639\u064a\u064a\u0646 \u062e\u0637 \u0633\u064a\u0631 \u0644\u062d\u0633\u0627\u0628\u0643 \u062d\u062a\u0649 \u0627\u0644\u0622\u0646. \u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0634\u0631\u0643\u0629." });
    }

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

  async listCompanyRouteIds(companyId: string): Promise<string[]> {
    const routes = await this.fetchRawEntityRows("Routes", companyId);
    if (!routes) return [];
    const routeIdCol = findHeader(routes.headers, "RouteID");
    if (!routeIdCol) return [];
    return Array.from(new Set(routes.rows.map((row) => String(row[routeIdCol] ?? "").trim()).filter(Boolean))).sort();
  }

  async listCompanyRoutes(companyId: string): Promise<Array<{ id: string; name: string | null }>> {
    const routes = await this.fetchRawEntityRows("Routes", companyId);
    if (!routes) return [];
    const routeIdCol = findHeader(routes.headers, "RouteID");
    const routeNameCol = findHeader(routes.headers, "RouteName") ?? findHeader(routes.headers, "Name");
    if (!routeIdCol) return [];
    const byId = new Map<string, { id: string; name: string | null }>();
    for (const row of routes.rows) {
      const id = String(row[routeIdCol] ?? "").trim();
      if (id && !byId.has(id.toLowerCase())) byId.set(id.toLowerCase(), { id, name: routeNameCol ? String(row[routeNameCol] ?? "").trim() || null : null });
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  // Raw (unfiltered) rows+headers for one Canonical Dataset, cached by
  // (companyId, entityName) and invalidated by a signature of the active
  // file ids currently backing it — same shape/reasoning as
  // ExcelDatasetEntityProvider's parsedDatasetCache (see the class-level
  // comment above). Concurrent callers for the same key share the same
  // in-flight Promise, so a burst of near-simultaneous entity reads (e.g.
  // Visit Copilot's daily-brief touching 8+ entities, each independently
  // calling resolveAllowedRouteIds) triggers exactly one Routes parse and
  // one Employees parse for the whole request, not one pair per entity.
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

    const cacheKey = `${companyId}::${entityName}`;
    const signature = matchingFiles
      .map((f: { id: string }) => f.id)
      .sort()
      .join(",");

    const cached = this.rawCache.get(cacheKey);
    if (cached && cached.signature === signature) {
      this.rawCache.delete(cacheKey);
      this.rawCache.set(cacheKey, cached);
      return cached.snapshot;
    }

    const snapshot = this.parseRawEntityRows(entityName, companyId, matchingFiles);
    this.rawCache.set(cacheKey, { signature, snapshot, createdAt: Date.now() });
    this.evictRawCache();

    try {
      return await snapshot;
    } catch (err) {
      const current = this.rawCache.get(cacheKey);
      if (current?.snapshot === snapshot) this.rawCache.delete(cacheKey);
      throw err;
    }
  }

  private evictRawCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.rawCache) {
      if (now - entry.createdAt > HIERARCHY_RAW_CACHE_TTL_MS) this.rawCache.delete(key);
    }
    while (this.rawCache.size > HIERARCHY_RAW_CACHE_MAX_ENTRIES) {
      const oldestKey = this.rawCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.rawCache.delete(oldestKey);
    }
  }

  // The actual download + XLSX parse, factored out so fetchRawEntityRows
  // can cache it as a unit — identical shape to
  // ExcelDatasetEntityProvider.parseDatasetFromFiles.
  private async parseRawEntityRows(
    entityName: string,
    companyId: string,
    matchingFiles: { id: string; sheetIndex: number; fileName: string }[],
  ): Promise<{ rows: DatasetRow[]; headers: string[] }> {
    let mergedRows: DatasetRow[] = [];
    let headers: string[] = [];
    for (const file of matchingFiles) {
      try {
        const tStart = Date.now();
        const buffer = await this.filesService.downloadFileBuffer(file.id, companyId);
        const tDownloadEnd = Date.now();
        // `sheets` restricts XLSX.read to the one needed sheet instead of
        // parsing the entire (possibly multi-sheet batch, tens of MB)
        // workbook — see ExcelDatasetEntityProvider.parseDatasetFromFiles
        // for the full explanation. Combined with the cache in
        // fetchRawEntityRows above (this call only happens once per
        // signature, not once per getRecords() call), Routes/Employees
        // resolution went from "150s+, repeated per entity read" to a
        // handful of seconds, once, per request.
        const rows = await serializeExcelParse(() => {
          const workbook = XLSX.read(buffer, {
            type: "buffer",
            cellDates: true,
            sheets: Array.from(new Set([file.sheetIndex, 0])),
          });
          const sheetName = workbook.SheetNames[file.sheetIndex] ?? workbook.SheetNames[0];
          const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
          return (sheet ? XLSX.utils.sheet_to_json(sheet) : []) as DatasetRow[];
        });
        const tEnd = Date.now();
        this.logger.log(
          `[HierarchyRawParseTiming] entity=${entityName} file=${file.fileName} bytes=${buffer.length} rows=${rows.length} ` +
            `download=${tDownloadEnd - tStart}ms parse=${tEnd - tDownloadEnd}ms`,
        );
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
