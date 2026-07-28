import { Injectable } from "@nestjs/common";
import type { Fsos360AnalysisFocus, Fsos360Filters } from "@field-sales-os/schemas";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { RieFacade } from "../rie/rie-facade.service";
import type { EntityQueryResult } from "../rie/entity-provider.interface";

export interface Fsos360Option {
  value: string;
  label: string;
}

export interface Fsos360Customer {
  code: string;
  name: string;
  city: string;
  branchId: string;
  routeId: string;
}

export interface Fsos360Product {
  code: string;
  name: string;
  brand: string;
  category: string;
}

export interface Fsos360Route {
  id: string;
  name: string;
  branchId: string;
  salesRepId: string;
}

export interface Fsos360Employee {
  id: string;
  name: string;
  managerId: string | null;
  branchId: string;
}

export interface Fsos360RouteAssignment {
  routeId: string;
  employeeId: string;
  role: string;
  startAt: number | null;
  endAt: number | null;
}

type Fsos360EntityName =
  | "Companies" | "Regions" | "Branches" | "Employees" | "Routes" | "Route Assignments"
  | "Customers" | "Products" | "Invoices" | "Invoice Items" | "Collections" | "Returns" | "Visits" | "Targets";

type Fsos360Datasets = { [key in Fsos360EntityName]: EntityQueryResult };
type Capability = { availability: "available" | "partial" | "unavailable"; available: boolean; reason: string | null };

export interface Fsos360ResolvedContext {
  filters: Fsos360Filters;
  removedSelections: Record<string, string[]>;
  activeAnalysisLevel: Fsos360AnalysisFocus | "mixed";
  customers: Map<string, Fsos360Customer>;
  products: Map<string, Fsos360Product>;
  routes: Map<string, Fsos360Route>;
  employees: Map<string, Fsos360Employee>;
  routeAssignments: Fsos360RouteAssignment[];
  branches: Map<string, { name: string; regionId: string }>;
  regions: Map<string, string>;
  datasets: Fsos360Datasets;
  smallFilterOptions: Record<string, Fsos360Option[]>;
  capabilities: Record<string, Capability>;
}

function timeOf(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function clean(values: string[] | undefined, allowed: Set<string>, removed: Record<string, string[]>, key: string): string[] | undefined {
  if (!values?.length) return undefined;
  const next = values.filter((value) => allowed.has(value));
  const invalid = values.filter((value) => !allowed.has(value));
  if (invalid.length) removed[key] = invalid;
  return next.length ? next : undefined;
}

function setOf(values: string[] | undefined): Set<string> | null {
  return values?.length ? new Set(values) : null;
}

function optionsFrom(entries: Iterable<[string, string]>): Fsos360Option[] {
  return Array.from(entries)
    .filter(([value]) => Boolean(value))
    .map(([value, label]) => ({ value, label: label || value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function assignmentMatchesAt(assignment: Fsos360RouteAssignment, routeId: string, at: number, employeeIds?: Set<string> | null): boolean {
  if (assignment.role !== "SalesRep" || assignment.routeId !== routeId || assignment.startAt === null) return false;
  if (employeeIds && !employeeIds.has(assignment.employeeId)) return false;
  return assignment.startAt <= at && (assignment.endAt === null || at <= assignment.endAt);
}

@Injectable()
export class Fsos360ContextService {
  constructor(private readonly rieFacade: RieFacade) {}

  private rieContext(user: AuthenticatedUser) {
    return { companyId: user.companyId!, requestingUser: { roleCode: user.roleCode, email: user.email } };
  }

  async resolve(user: AuthenticatedUser, input: Fsos360Filters, focus?: Fsos360AnalysisFocus): Promise<Fsos360ResolvedContext> {
    const ctx = this.rieContext(user);
    const entityNames: Fsos360EntityName[] = ["Companies", "Regions", "Branches", "Employees", "Routes", "Route Assignments", "Customers", "Products", "Invoices", "Invoice Items", "Collections", "Returns", "Visits", "Targets"];
    const results = await Promise.all(entityNames.map((entity) => this.rieFacade.getEntityRecords(entity, ctx)));
    const datasets = Object.fromEntries(entityNames.map((entity, index) => [entity, results[index]!])) as Fsos360Datasets;

    const regions = new Map<string, string>();
    for (const row of datasets.Regions.available ? datasets.Regions.records : []) {
      const id = String(row.RegionID ?? "").trim();
      if (id) regions.set(id, String(row.RegionName ?? id));
    }
    const branches = new Map<string, { name: string; regionId: string }>();
    for (const row of datasets.Branches.available ? datasets.Branches.records : []) {
      const id = String(row.BranchID ?? "").trim();
      if (id) branches.set(id, { name: String(row.BranchName ?? id), regionId: String(row.RegionID ?? "").trim() });
    }
    const employees = new Map<string, Fsos360Employee>();
    for (const row of datasets.Employees.available ? datasets.Employees.records : []) {
      const id = String(row.EmployeeID ?? "").trim();
      if (id) employees.set(id, { id, name: String(row.EmployeeName ?? id), managerId: String(row.DirectManagerID ?? "").trim() || null, branchId: String(row.BranchID ?? "").trim() });
    }
    const routes = new Map<string, Fsos360Route>();
    for (const row of datasets.Routes.available ? datasets.Routes.records : []) {
      const id = String(row.RouteID ?? "").trim();
      if (id) routes.set(id, { id, name: String(row.RouteName ?? id), branchId: String(row.BranchID ?? "").trim(), salesRepId: String(row.SalesRepID ?? "").trim() });
    }
    const routeAssignments = (datasets["Route Assignments"].available ? datasets["Route Assignments"].records : []).map((row) => ({
      routeId: String(row.RouteID ?? "").trim(),
      employeeId: String(row.EmployeeID ?? "").trim(),
      role: String(row.Role ?? "").trim(),
      startAt: timeOf(row.StartDate),
      endAt: timeOf(row.EndDate),
    })).filter((assignment) => Boolean(assignment.routeId && assignment.employeeId));
    const customers = new Map<string, Fsos360Customer>();
    for (const row of datasets.Customers.available ? datasets.Customers.records : []) {
      const code = String(row.CustomerCode ?? "").trim();
      if (code) customers.set(code, { code, name: String(row.CustomerName ?? code), city: String(row.City ?? "").trim(), branchId: String(row.BranchID ?? "").trim(), routeId: String(row.RouteID ?? "").trim() });
    }
    const products = new Map<string, Fsos360Product>();
    for (const row of datasets.Products.available ? datasets.Products.records : []) {
      const code = String(row.ProductCode ?? "").trim();
      if (code) products.set(code, { code, name: String(row.ProductName ?? code), brand: String(row.Brand ?? "").trim(), category: String(row.Category ?? "").trim() });
    }

    const removedSelections: Record<string, string[]> = {};
    const filters: Fsos360Filters = { companyId: user.companyId! };
    if (input.companyId && input.companyId !== user.companyId) removedSelections.companyId = [input.companyId];
    filters.regionIds = clean(input.regionIds, new Set(regions.keys()), removedSelections, "regionIds");

    const regionSet = setOf(filters.regionIds);
    const cityAllowed = new Set<string>();
    const branchAllowed = new Set<string>();
    for (const customer of customers.values()) {
      const branch = branches.get(customer.branchId);
      if (!regionSet || (branch && regionSet.has(branch.regionId))) cityAllowed.add(customer.city);
    }
    for (const [branchId, branch] of branches) if (!regionSet || regionSet.has(branch.regionId)) branchAllowed.add(branchId);
    filters.cityValues = clean(input.cityValues, cityAllowed, removedSelections, "cityValues");
    const citySet = setOf(filters.cityValues);
    if (citySet) {
      branchAllowed.clear();
      for (const customer of customers.values()) if (citySet.has(customer.city)) branchAllowed.add(customer.branchId);
    }
    filters.branchIds = clean(input.branchIds, branchAllowed, removedSelections, "branchIds");
    const branchSet = setOf(filters.branchIds);

    // Employee role semantics are not trustworthy enough to expose manager/supervisor as separate filters.
    if (input.managerIds?.length) removedSelections.managerIds = input.managerIds;
    if (input.supervisorIds?.length) removedSelections.supervisorIds = input.supervisorIds;

    const routeAllowed = new Set<string>();
    for (const route of routes.values()) if (!branchSet || branchSet.has(route.branchId)) routeAllowed.add(route.id);
    filters.routeIds = clean(input.routeIds, routeAllowed, removedSelections, "routeIds");
    const routeSet = setOf(filters.routeIds);

    const repAllowed = new Set<string>();
    for (const assignment of routeAssignments) {
      if (assignment.role === "SalesRep" && assignment.startAt !== null && (!routeSet || routeSet.has(assignment.routeId))) repAllowed.add(assignment.employeeId);
    }
    filters.salesRepIds = clean(input.salesRepIds, repAllowed, removedSelections, "salesRepIds");

    const customerAllowed = new Set<string>();
    for (const customer of customers.values()) {
      if (citySet && !citySet.has(customer.city)) continue;
      if (branchSet && !branchSet.has(customer.branchId)) continue;
      if (routeSet && !routeSet.has(customer.routeId)) continue;
      customerAllowed.add(customer.code);
    }
    filters.customerCodes = clean(input.customerCodes, customerAllowed, removedSelections, "customerCodes");
    filters.brandValues = clean(input.brandValues, new Set(Array.from(products.values(), (product) => product.brand).filter(Boolean)), removedSelections, "brandValues");
    const brandSet = setOf(filters.brandValues);
    const categoryAllowed = new Set<string>();
    for (const product of products.values()) if (!brandSet || brandSet.has(product.brand)) categoryAllowed.add(product.category);
    filters.categoryValues = clean(input.categoryValues, categoryAllowed, removedSelections, "categoryValues");
    const categorySet = setOf(filters.categoryValues);
    const productAllowed = new Set<string>();
    for (const product of products.values()) if ((!brandSet || brandSet.has(product.brand)) && (!categorySet || categorySet.has(product.category))) productAllowed.add(product.code);
    filters.productCodes = clean(input.productCodes, productAllowed, removedSelections, "productCodes");

    const activeAnalysisLevel = this.resolveAnalysisLevel(filters, focus);
    const routeOptions = new Map<string, string>();
    for (const routeId of routeAllowed) {
      const route = routes.get(routeId);
      if (route) routeOptions.set(route.id, route.name);
    }
    const cityOptions = new Map<string, string>();
    for (const city of cityAllowed) if (city) cityOptions.set(city, city);
    const managerSupervisorReason = datasets.Employees.available ? "manager-supervisor-role-ambiguous" : "employees-dataset-unavailable";
    const routeAssignmentAvailable = datasets["Route Assignments"].available && routeAssignments.some((assignment) => assignment.role === "SalesRep" && assignment.startAt !== null);

    return {
      filters,
      removedSelections,
      activeAnalysisLevel,
      customers,
      products,
      routes,
      employees,
      routeAssignments,
      branches,
      regions,
      datasets,
      smallFilterOptions: {
        company: [{ value: user.companyId!, label: "Company" }],
        regionCity: optionsFrom([...regions.entries(), ...cityOptions.entries()]),
        branch: optionsFrom(Array.from(branchAllowed, (id) => [id, branches.get(id)?.name ?? id])),
        manager: [],
        supervisor: [],
        route: optionsFrom(routeOptions.entries()),
      },
      capabilities: {
        companies: { availability: datasets.Companies.available ? "available" : "partial", available: true, reason: datasets.Companies.available ? null : "authenticated-company-only" },
        regions: { availability: datasets.Regions.available ? "available" : "unavailable", available: datasets.Regions.available, reason: datasets.Regions.available ? null : "regions-dataset-unavailable" },
        routeAssignments: { availability: routeAssignmentAvailable ? "available" : "unavailable", available: routeAssignmentAvailable, reason: routeAssignmentAvailable ? null : "route-assignment-history-unavailable" },
        manager: { availability: "unavailable", available: false, reason: managerSupervisorReason },
        supervisor: { availability: "unavailable", available: false, reason: managerSupervisorReason },
      },
    };
  }

  private resolveAnalysisLevel(filters: Fsos360Filters, focus?: Fsos360AnalysisFocus): Fsos360AnalysisFocus | "mixed" {
    if (focus) return focus;
    const candidates: Fsos360AnalysisFocus[] = [];
    if (filters.routeIds?.length) candidates.push("route");
    if (filters.salesRepIds?.length) candidates.push("sales-rep");
    if (filters.customerCodes?.length) candidates.push("customer");
    if (filters.productCodes?.length) candidates.push("product");
    if (filters.categoryValues?.length) candidates.push("category");
    if (filters.brandValues?.length) candidates.push("brand");
    if (candidates.length > 1) return "mixed";
    if (candidates.length === 1) return candidates[0]!;
    if (filters.branchIds?.length) return "branch";
    if (filters.regionIds?.length || filters.cityValues?.length) return "region";
    return "company";
  }
}
