// Lightweight response DTOs mirroring what the API actually returns. The
// frontend deliberately does not import @field-sales-os/database (Prisma
// types) — this file is the boundary, kept in sync by hand with the API's
// serialized shapes.
import type {
  BillingInterval,
  CompanyPolicyType,
  CompanyStatus,
  DataSourceHealthStatus,
  DataSourceStatus,
  EmploymentStatus,
  FileStatus,
  PaymentProviderType,
  PaymentRecordStatus,
  RefreshRunStatus,
  RefreshType,
  RoleCode,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  UserStatus,
} from "@field-sales-os/schemas";

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description?: string | null;
}

export interface User {
  id: string;
  companyId: string | null;
  roleId: string;
  email: string;
  fullName: string;
  status: UserStatus;
  orgUnitId: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: Role;
  permissions?: string[];
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export type DiscoveryProvider = "OSM" | "GOOGLE";

export interface CompanyProfileData {
  id: string;
  companyId: string;
  logoUrl: string | null;
  discoveryProvider: DiscoveryProvider;
  // Whether the currently selected provider has stored credentials — never
  // exposes the credential itself. Generic across providers (OSM never has
  // any; GOOGLE does once a key is saved).
  hasDiscoveryCredentials: boolean;
  country: string | null;
  city: string | null;
  timeZone: string | null;
  currency: string | null;
  defaultLanguage: string | null;
  fiscalYearStart: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  code: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  companyId: string;
  employeeCode: string;
  fullName: string;
  jobTitle: string | null;
  orgUnitId: string | null;
  managerId: string | null;
  status: EmploymentStatus;
  hireDate: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataSourceType {
  id: string;
  typeCode: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface DataSource {
  id: string;
  companyId: string;
  name: string;
  type: string;
  description: string | null;
  dataCategory: string | null;
  status: DataSourceStatus;
  connectionConfig: Record<string, unknown> | null;
  authMethod: string | null;
  hasCredentials: boolean;
  ownerUserId: string | null;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  provider: string | null;
  healthStatus: DataSourceHealthStatus;
  schemaVersion: number;
  lastRefreshAt: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualityReportData {
  totalCategories: number;
  matchedCategories: string[];
  missingFiles: string[];
  invalidSchema: string[];
  validationScore: number;
  structuralValidationError?: string | null;
}

export interface RefreshRunData {
  id: string;
  companyId: string;
  dataSourceId: string;
  triggeredByUserId: string | null;
  refreshType: RefreshType;
  status: RefreshRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  importedRecords: number;
  errorCount: number;
  dataQualityScore: number | null;
  resultSummary: DataQualityReportData | null;
  createdAt: string;
}

export interface CompanyPolicyData {
  id: string;
  companyId: string;
  policyType: CompanyPolicyType;
  value: Record<string, unknown>;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompliancePolicyStatusData {
  policyType: CompanyPolicyType;
  hasPolicy: boolean;
  isCompliant: boolean;
  notes?: string;
}

export interface ComplianceOverviewData {
  companyId: string;
  policies: CompliancePolicyStatusData[];
  overallCompliant: boolean;
  checkedAt: string;
}

export interface PlatformObservabilityData {
  companiesCount: number;
  usersCount: number;
  refreshRunsCount: number;
  refreshRunsLast24h: number;
  avgRefreshDurationMs: number | null;
  importSuccessRate: number | null;
  dataSourceUsageRate: number | null;
  securityOperationsCount: number;
  auditOperationsCount: number;
  refreshErrorRate: number | null;
  generatedAt: string;
}

export interface EmployeeContext {
  employeeId: string;
  companyId: string;
  orgUnitId: string | null;
  orgUnitPath: string | null;
  managerId: string | null;
  managerName: string | null;
  status: EmploymentStatus;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: BillingInterval;
  maxUsers: number | null;
  features: Record<string, unknown>;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  paymentStatus: SubscriptionPaymentStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  plan: Plan;
  company?: Company;
}

export interface Payment {
  id: string;
  companyId: string;
  subscriptionId: string | null;
  provider: PaymentProviderType;
  amountCents: number;
  currency: string;
  status: PaymentRecordStatus;
  paidAt: string | null;
  createdAt: string;
  company?: Company;
}

export interface DatasetCandidate {
  datasetType: string;
  confidence: number;
}

export interface DetectedFileMetadata {
  period?: { from: string; to: string };
  region?: string[];
  branch?: string[];
  salesRep?: string[];
  route?: string[];
}

export interface MixedSheetSummary {
  sheetIndex: number;
  sheetName: string;
  topCandidate: DatasetCandidate | null;
  rowCount: number;
  headerCount: number;
}

export interface FileRecord {
  id: string;
  companyId: string;
  uploadedByUserId: string;
  datasetType: string;
  datasetTypeConfidence: number | null;
  // Always true post-ADR-001 — a file only exists once it has passed the
  // strict Import Validation gate against a specific template, so there's
  // nothing left to confirm. Kept (rather than removed) because it's still
  // a real column on old, pre-migration rows.
  datasetTypeConfirmed: boolean;
  sheetIndex: number;
  // Every File row created from the SAME physical upload shares one
  // batchId (2026-07-19 multi-sheet upload change — see
  // files.service.ts's processWorkbook). A single-sheet upload is a
  // "batch of one". Used to group the Files screen's list into one card
  // per physical upload instead of one card per entity.
  batchId: string;
  fileName: string;
  sizeBytes: number;
  status: FileStatus;
  isActive: boolean;
  createdAt: string;
  parsedMetadata?: {
    sheetNames: string[];
    rowCount: number;
    headers: string[];
    headerCount: number;
    classification?: {
      candidates: DatasetCandidate[];
      isMixed: boolean;
      sheets?: MixedSheetSummary[];
    };
    detected?: DetectedFileMetadata;
  } | null;
}

// Route Planning — balanced territory/route split feature. See
// docs/PROJECT_LOG.md's "Route-splitting / territory design" section for
// the algorithm's design history (why region-growth, why Haversine not
// drive time, etc.).
//
// Migration #4 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. Customers/Invoices/Invoice Items are resolved automatically via
// RieFacade; sales value is always the RIE "sales" aggregate. Scope
// narrowing is now one of a fixed set of real Customers fields.
export type RoutePlanningScopeField = "RouteID" | "City" | "CustomerClass" | "Channel";

export interface RoutePlanningSplitRequest {
  scopeField: RoutePlanningScopeField;
  scopeValues: string[];
  groupCount: number;
  tolerance?: number;
}

export interface RoutePlanningScopeValuesRequest {
  scopeField: RoutePlanningScopeField;
}

export interface RoutePlanningValuesResult {
  values: string[];
}

export interface RoutePlanningRecord {
  id: string;
  label: string;
  lat: number;
  lon: number;
  sales: number;
  before: number;
  after: number;
}

export interface RoutePlanningSplitResult {
  scopeColumn: string;
  scopeValues: string[];
  groupCount: number;
  target: number;
  excludedBadCoordinates: number;
  totalScopedRows: number;
  usedRows: number;
  beforeTotals: number[];
  afterTotals: number[];
  beforeCounts: number[];
  afterCounts: number[];
  records: RoutePlanningRecord[];
}

// Heat map — dashboard feature with a free-text filter box. See
// docs/PROJECT_LOG.md for the design discussion (why a hybrid
// dashboard-map + LLM-interpreted-filter approach, not a GPT Action).
//
// Migration #3 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. Customers/Invoices/Invoice Items/Returns/Collections/Products
// are resolved automatically via RieFacade — only business inputs remain.
export type HeatmapScopeField = "RouteID" | "City" | "CustomerClass" | "Channel";

export interface HeatmapQueryRequest {
  metric: "sales" | "returns" | "collection" | "lostSales" | "opportunity" | "customerCount";
  scopeField?: HeatmapScopeField;
  scopeValues?: string[];
  categoryValue?: string;
  dateFrom?: string;
  dateTo?: string;
  priorDateFrom?: string;
  priorDateTo?: string;
}

export interface HeatmapScopeValuesRequest {
  scopeField: HeatmapScopeField;
}

export interface HeatmapValuesResult {
  values: string[];
}

export interface HeatmapPoint {
  id: string;
  label: string;
  lat: number;
  lon: number;
  value: number;
}

export interface HeatmapQueryResult {
  metric: "sales" | "returns" | "collection" | "lostSales" | "opportunity" | "customerCount";
  excludedBadCoordinates: number;
  totalRows: number;
  usedRows: number;
  maxValue: number;
  totalValue: number;
  points: HeatmapPoint[];
}

export interface HeatmapInterpretRequest {
  prompt: string;
  scopeColumn?: string;
  scopeValues?: string[];
  currentScopeValue?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
}

export interface HeatmapInterpretResult {
  scopeValue: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  metric: "sales" | "returns" | "collection" | "customerCount" | null;
  understood: boolean;
  explanation: string;
}

// AI Decision Map — a Claude-generated action list layered on top of an
// already-computed Heat Map result (see heatmap.schemas.ts).
export interface HeatmapDecisionRequest {
  metric: "sales" | "returns" | "collection" | "lostSales" | "opportunity" | "customerCount";
  scopeLabel?: string;
  totalValue: number;
  usedRows: number;
  topPoints: { label: string; value: number }[];
}

export interface HeatmapDecisionAction {
  title: string;
  detail: string;
}

export interface HeatmapDecisionResult {
  summary: string;
  actions: HeatmapDecisionAction[];
}

// New Customer — Geo Intelligence. Deliberately narrow: location capture +
// reference-customer resolution + product-assortment analysis, then stop —
// no invoice/order/customer-creation steps (see PROJECT_LOG.md).
//
// Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. Customers/Invoices/Invoice Items/Products are resolved
// automatically via RieFacade — only business inputs remain.
export interface GeoIntelligenceLocation {
  lat: number;
  lon: number;
}

export type GeoIntelligenceScopeField = "RouteID" | "City" | "CustomerClass" | "Channel";

export interface GeoIntelligenceCustomersRequest {
  search?: string;
}

export interface GeoIntelligenceCustomer {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface GeoIntelligenceCustomersResult {
  customers: GeoIntelligenceCustomer[];
}

export interface GeoIntelligenceValuesResult {
  values: string[];
}

export interface GeoIntelligenceAnalyzeRequest {
  location: GeoIntelligenceLocation;
  mode: "auto" | "manual" | "both";
  nearestCount?: number;
  manualCustomerIds?: string[];
  topProductsLimit?: number;
}

export interface GeoIntelligenceResolvedCustomer {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number | null;
  source: "auto" | "manual";
}

export interface GeoIntelligenceTopProduct {
  sku: string;
  name: string;
  category: string | null;
  totalQty: number;
  totalValue: number;
  customerCount: number;
}

export interface GeoIntelligenceAnalyzeResult {
  resolvedCustomers: GeoIntelligenceResolvedCustomer[];
  topProducts: GeoIntelligenceTopProduct[];
  excludedBadCoordinates: number;
  totalRowsConsidered: number;
}

export interface GeoIntelligenceTalkingPointsRequest {
  areaLabel?: string;
  customerCount: number;
  topProducts: GeoIntelligenceTopProduct[];
  framing?: "new_customer" | "gap";
}

export interface GeoIntelligenceTalkingPointsResult {
  summary: string;
  talkingPoints: string[];
}

// Customer Comparison — "what do this customer's neighbors buy that they
// don't?" A sales-gap/upsell view for an EXISTING customer, sibling feature
// to New Customer's analyze() but anchored at the target customer's own
// recorded location instead of a freshly-captured one.
//
// Migration #1 (ADR-001 / RIE Migration Plan): no fileId/column mapping —
// the backend resolves Customers/Invoices/Invoice Items/Products via
// RieFacade against the Canonical Schema.
export interface GeoIntelligenceCompareRequest {
  targetCustomerId: string;
  nearestCount?: number;
  topProductsLimit?: number;
}

export interface GeoIntelligenceCompareCustomersRequest {
  search?: string;
}

export interface GeoIntelligenceCompareResult {
  targetCustomer: GeoIntelligenceCustomer;
  neighbors: GeoIntelligenceResolvedCustomer[];
  targetProductCount: number;
  gapProducts: GeoIntelligenceTopProduct[];
  excludedBadCoordinates: number;
  totalRowsConsidered: number;
}

// New Customer Expansion Map, territory-level upgrade — grid-based
// whitespace scan. Points feed directly into the existing HeatmapMap
// component (same {id,label,lat,lon,value} shape).
//
// Migration #5 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. Customer value is always the RIE "sales" aggregate. Scope
// narrowing is now one of a fixed set of real Customers fields.
export interface GeoIntelligenceExpansionRequest {
  scopeField?: GeoIntelligenceScopeField;
  scopeValues?: string[];
  gridSizeKm: number;
}

export interface GeoIntelligenceExpansionScopeValuesRequest {
  scopeField: GeoIntelligenceScopeField;
}

export interface GeoIntelligenceExpansionResult {
  customerCount: number;
  gridSizeKm: number;
  totalCells: number;
  emptyCellsScored: number;
  maxScore: number;
  points: HeatmapPoint[];
}

export interface PlatformSettings {
  id: string;
  trialEnabled: boolean;
  trialDurationDays: number;
  defaultPlanCode: string;
  autoStartTrialOnRegistration: boolean;
  gptBaseUrl: string;
  updatedAt: string;
}

// What the Custom GPT posts to POST /gpt/render, mirrored back to the
// frontend. `type` is intentionally untyped here (string) — the component
// registry (components/analysis-studio/registry.tsx) is the only place
// that needs to know the current set of renderable block types.
export interface AnalysisBlock {
  type: string;
  id: string;
  title?: string;
  purpose?: string;
  sourceDatasetIds?: string[];
  payload: unknown;
}

// Native, in-app replacement for the external ChatGPT Custom GPT screen —
// stateless: the frontend keeps the running message list and resends it
// (capped) each turn, no server-side conversation/session to manage.
export interface AssistantChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantChatRequest {
  message: string;
  history: AssistantChatMessage[];
}

export interface AssistantChatResponse {
  reply: string;
  blocks: AnalysisBlock[];
}

export interface AnalysisEventContent {
  narrative?: string;
  blocks: AnalysisBlock[];
}

export interface AnalysisEvent {
  id: string;
  companyId: string;
  userId: string | null;
  reportType: string;
  content: AnalysisEventContent;
  createdAt: string;
}

export interface GptConfig {
  id: string;
  companyId: string;
  name: string;
  apiKeyId: string;
  isActive: boolean;
  createdAt: string;
}

// Team Performance — strategic point 3's second half. Migration #7 (ADR-001
// / RIE Migration Plan) — no file/column mapping. Sales = Invoice Items
// joined to Invoices, collection = Collections, returns = Returns, all via
// RieFacade. Rep identity: RouteID -> Routes.SalesRepID -> Employees.
// Supervisor grouping: Employees.DirectManagerID (formal reporting line —
// explicit product decision, not Routes.SupervisorID).
export interface TeamPerformanceQueryRequest {
  dateFrom: string;
  dateTo: string;
  priorDateFrom?: string;
  priorDateTo?: string;
}

// null on sales/collection/returns = that category's Dataset isn't
// uploaded at all (see TeamPerformanceResult.categoriesAvailable) —
// distinct from 0, a real total within the window. Explicit product
// decision: an unavailable category is omitted, not zeroed, and does not
// block the other two from rendering.
export interface TeamPerformanceRepRow {
  repEmail: string;
  repName: string;
  supervisorEmail: string | null;
  supervisorName: string | null;
  sales: number | null;
  salesPrior: number | null;
  collection: number | null;
  collectionPrior: number | null;
  returns: number | null;
  returnsPrior: number | null;
}

export interface TeamPerformanceResult {
  reps: TeamPerformanceRepRow[];
  scopedToOwnTeam: boolean;
  categoriesAvailable: {
    sales: boolean;
    collection: boolean;
    returns: boolean;
  };
}

export interface TeamPerformanceCoachRequest {
  repName: string;
  sales: number;
  salesPrior: number | null;
  collection: number;
  collectionPrior: number | null;
  returns: number;
  returnsPrior: number | null;
}

export interface TeamPerformanceCoachResult {
  note: string;
  tone: "positive" | "attention" | "neutral";
}

// Visit Efficiency Map — per-rep-day sequenced visit distances (see
// visit-efficiency.schemas.ts). Points extend HeatmapPoint's shape with
// `rep`/`dateKey` so the frontend can filter the map by rep and build the
// per-rep expandable detail rows / Excel export without a second lookup.
export interface VisitEfficiencyPoint extends HeatmapPoint {
  rep: string;
  dateKey: string;
}

// Migration #6 (ADR-001 / RIE Migration Plan) — no file/column mapping.
export type VisitEfficiencyScopeField = "RouteID" | "City" | "CustomerClass" | "Channel";

export interface VisitEfficiencyQueryRequest {
  scopeField?: VisitEfficiencyScopeField;
  scopeValues?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface VisitEfficiencyScopeValuesRequest {
  scopeField: VisitEfficiencyScopeField;
}

export interface VisitEfficiencyValuesResult {
  values: string[];
}

export interface VisitEfficiencyRepSummary {
  rep: string;
  visitDays: number;
  totalVisits: number;
  totalDistanceKm: number;
  avgDistanceKmPerVisit: number;
}

export interface VisitEfficiencyResult {
  usedVisits: number;
  excludedNoCoordinates: number;
  excludedSingleVisitDays: number;
  timeColumnUsed: boolean;
  points: VisitEfficiencyPoint[];
  repSummaries: VisitEfficiencyRepSummary[];
}

// Customer Similarity Map — clusters customers by a behavioral feature
// vector (spend/frequency/assortment breadth), not geography. Reuses
// RoutePlanningRecord's exact shape (before === after here — no
// geographic "before" state) so the frontend renders it with the same
// RouteSplitMap component used by Route Planning.
// "أساس التشابه" (July 2026) — which behavioral signal drives the
// clustering. "sales" (default) optionally narrows to one category first
// (salesCategoryColumn/salesCategoryValue); "collection"/"returns" cluster
// on those files instead. See packages/schemas/customer-similarity.schemas.ts.
export type CustomerSimilarityBasis = "sales" | "collection" | "returns";

// Migration #2 (ADR-001 / RIE Migration Plan, 2026-07-17) — no file/column
// mapping. scopeField is now one of a fixed set of real Customers fields
// (previously an arbitrary picked column); salesCategoryValue narrows by
// Products.Category directly.
export type CustomerSimilarityScopeField = "RouteID" | "City" | "CustomerClass" | "Channel";

export interface CustomerSimilarityQueryRequest {
  clusterCount: number;
  similarityBasis: CustomerSimilarityBasis;
  scopeField?: CustomerSimilarityScopeField;
  scopeValues?: string[];
  salesCategoryValue?: string;
}

export interface CustomerSimilarityScopeValuesRequest {
  scopeField: CustomerSimilarityScopeField;
}

export interface CustomerSimilarityValuesResult {
  values: string[];
}

export interface CustomerSimilarityClusterProfile {
  avgTotalValue: number;
  avgOrderCount: number;
  avgDistinctSkus: number | null;
}

export interface CustomerSimilarityResult {
  clusterCount: number;
  excludedNoSalesData: number;
  totalScopedRows: number;
  usedRows: number;
  similarityBasis: CustomerSimilarityBasis;
  afterTotals: number[];
  afterCounts: number[];
  clusterProfiles: CustomerSimilarityClusterProfile[];
  records: RoutePlanningRecord[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Sales Growth Intelligence (SGI) Phase 1. See docs/SGI_ROADMAP.md and
// apps/api/src/modules/sgi/sgi.service.ts for the full computation.
export type SgiSituationType =
  | "TARGET_BEHIND"
  | "LOST_SALES"
  | "CUSTOMER_DECLINING"
  | "CUSTOMER_INACTIVE"
  | "COLLECTION_RISK"
  | "GROWTH_OPPORTUNITY"
  | "PRODUCT_DECLINE";
export type SgiSeverity = "high" | "medium" | "low";

export interface SgiSituation {
  id: string;
  type: SgiSituationType;
  severity: SgiSeverity;
  entityType: "rep" | "customer";
  entityKey: string;
  entityLabel: string;
  title: string;
  detail: string;
  recommendation: string;
  metricValue: number;
  metricValuePrior: number | null;
  periodMonth: string;
  ownerRepEmail: string | null;
}

// Migration #8 (ADR-001 / RIE Migration Plan) — no file/column mapping.
// Sales/collection are resolved automatically via RieFacade; only the date
// window remains as input.
export interface SgiRecalculateRequest {
  periodMonth: string;
  dateFrom: string;
  dateTo: string;
  priorDateFrom: string;
  priorDateTo: string;
}

export interface SgiSummary {
  totalSituations: number;
  highSeverityCount: number;
  monthlyGoal: {
    targetTotal: number | null;
    actualTotal: number;
    progressPct: number | null;
  };
}

export interface SgiRecalculateResult {
  generatedAt: string;
  periodMonth: string;
  situations: SgiSituation[];
  warnings: string[];
  summary: SgiSummary;
  // SgiService's own opening summary — generated once at the source, shown
  // as-is by every consumer (Sales Growth screen, Assistant). See
  // sgi.service.ts's buildBriefing.
  briefing: string;
}

// Display-name lookup for the Priority Center hierarchy (see
// sales-growth/priority-tree.tsx) — email -> name, plus each rep's
// supervisor when known. Scoped server-side to whatever the viewer can
// already see (see sgi.service.ts's getLatest).
export interface SgiRepDirectoryEntry {
  email: string;
  name: string;
  supervisorEmail: string | null;
  supervisorName: string | null;
}

// Reports feature (Task #259) — per-rep KPI snapshot backing the "360
// درجة" section of the Reports wizard. Filtered server-side to exactly the
// emails in repDirectory (same visibility boundary).
export interface SgiRepStats {
  salesActual: number;
  salesTarget: number | null;
  collectionActual: number;
  activeCustomers: number;
  topProducts: Array<{ name: string; value: number }>;
}

export interface SgiLatestResult {
  generatedAt: string;
  periodMonth: string;
  situations: SgiSituation[];
  warnings: string[];
  summary: SgiSummary;
  briefing: string;
  repDirectory: SgiRepDirectoryEntry[];
  repStats: Record<string, SgiRepStats>;
  scopedToOwnTeam: boolean;
}

// SGIContext — the single, reusable "decision object" passed between SGI
// consumers (see packages/schemas/src/sgi-context.schemas.ts for the full
// rationale, mirrored here). Built from a SgiSituation by
// lib/sgi-context.ts's toSgiContext(), then carried across screens via a
// generic ?context=... deep link (buildAssistantDeepLink) — not a
// screen-specific mechanism, so Customer 360 / Daily Mission / Visit
// Planning / Voice can all reuse it later without a new contract.
export type SgiContextSource = "sales-growth" | "assistant" | "customer-360" | "daily-mission" | "visit-planning" | "voice";

export interface SgiContext {
  contextVersion: 1;
  source: SgiContextSource;
  recommendationId: string;
  situationType: SgiSituationType;
  severity: SgiSeverity;
  entityType: "rep" | "customer";
  entityId: string;
  entityName: string;
  title: string;
  reasoning: string;
  executionPlan: string[];
  metricValue: number;
  metricValuePrior: number | null;
  periodMonth: string;
  timestamp: string;
}

// Territory Intelligence — per-territory (grouped by City) health scoring
// and AI decision panel (see apps/web/src/app/(dashboard)/dashboard/
// territory-intelligence/page.tsx). `why` reuses SgiSituationType/SgiSeverity
// as-is rather than a narrower union — Territory Intelligence never emits
// TARGET_BEHIND, but one always-absent union member is harmless and keeps
// this from drifting out of sync with SGI's own type if it's extended later.
export type TerritoryTier = "excellent" | "good" | "average" | "weak" | "veryWeak";

export interface TerritoryWhyItem {
  type: SgiSituationType;
  severity: SgiSeverity;
  label: string;
  detail: string;
}

export interface TerritoryMetrics {
  salesGrowthPct: number | null;
  activeCustomerRatePct: number;
  lostSalesCount: number;
  visitCoveragePct: number | null;
  collectionHealthPct: number | null;
}

export interface TerritorySummaryItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  customerCount: number;
  healthScore: number;
  tier: TerritoryTier;
  metrics: TerritoryMetrics;
  why: TerritoryWhyItem[];
  recommendation: string;
  suggestedActions: string[];
  expectedImpactSar: number | null;
  opportunityValueSar: number;
}

// Pre-sorted worst-first (ascending healthScore) by the API.
export interface TerritoryIntelligenceSummaryResponse {
  territories: TerritorySummaryItem[];
  generatedAt: string;
  groupedBy: "City";
}

export interface TerritoryExecutiveItem {
  territoryId: string;
  name: string;
  value: number | null;
  reason: string;
}

export interface TerritoryIntelligenceExecutiveResponse {
  topOpportunities: TerritoryExecutiveItem[];
  worstTerritories: TerritoryExecutiveItem[];
  fastestWin: TerritoryExecutiveItem | null;
  biggestRisk: TerritoryExecutiveItem | null;
  generatedAt: string;
}

// Decision Analytics Studio — mirrors packages/schemas/src/decision-analytics-studio.schemas.ts
// field-for-field (this app hand-maintains a parallel `lib/types.ts` for
// every backend schema rather than importing the zod types directly into
// client components — same convention as every other module above).
export type DecisionAnalyzeByDimension = "territory" | "channel" | "category" | "brand" | "product" | "customer" | "representative" | "supervisor";

export interface DecisionFilters {
  dateFrom: string;
  dateTo: string;
  priorDateFrom?: string;
  priorDateTo?: string;
  branchIds?: string[];
  cityValues?: string[];
  channelValues?: string[];
  categoryValues?: string[];
  brandValues?: string[];
  productCodes?: string[];
  customerCodes?: string[];
  repEmails?: string[];
  supervisorEmails?: string[];
}

export interface DecisionQueryInput extends DecisionFilters {
  analyzeBy: DecisionAnalyzeByDimension;
}

export interface DecisionKpiSummary {
  sales: number;
  salesGrowthPct: number | null;
  collections: number | null;
  returns: number | null;
  lostSalesValue: number;
  ordersCount: number;
  averageOrderValue: number | null;
  activeCustomersCount: number;
  coveragePct: number | null;
  strikeRatePct: number | null;
  productivity: number | null;
}

export interface DecisionChartGroup {
  key: string;
  label: string;
  sales: number;
  salesPriorPct: number | null;
  collections: number | null;
  returns: number | null;
  ordersCount: number;
  activeCustomersCount: number;
  // Chart Color & Visual Intelligence Standard v1.0 — only populated for
  // analyzeBy = "representative"/"supervisor"; null everywhere else and for
  // a rep/supervisor with no matching Targets row this period. See
  // decision-analytics-studio.schemas.ts's decisionChartGroupSchema.
  target: number | null;
}

export interface DecisionHeatmapTerritory {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sales: number;
}

export type DecisionInsightType = "LOST_SALES" | "CUSTOMER_DECLINING" | "CUSTOMER_INACTIVE" | "COLLECTION_RISK" | "GROWTH_OPPORTUNITY" | "PRODUCT_DECLINE" | "TARGET_BEHIND";

export interface DecisionInsightItem {
  type: DecisionInsightType;
  severity: "high" | "medium" | "low";
  label: string;
  detail: string;
}

export interface DecisionQueryResult {
  kpis: DecisionKpiSummary;
  chart: DecisionChartGroup[];
  heatmap: DecisionHeatmapTerritory[];
  insights: DecisionInsightItem[];
  generatedAt: string;
  datasetsAvailable: { invoices: boolean; collections: boolean; returns: boolean; visits: boolean };
}

export type DecisionFilterField = "branch" | "territory" | "channel" | "category" | "brand" | "product" | "customer" | "representative" | "supervisor";

export interface DecisionFilterOption {
  value: string;
  label: string;
}

export interface DecisionFilterOptionsResult {
  options: DecisionFilterOption[];
}

export interface DecisionTableQueryInput extends DecisionFilters {
  page: number;
  pageSize: number;
}

export interface DecisionTableRow {
  invoiceNo: string;
  lineNo: number;
  date: string | null;
  customerCode: string;
  customerName: string;
  city: string;
  channel: string;
  productCode: string;
  productName: string;
  category: string;
  brand: string;
  repName: string;
  supervisorName: string;
  amount: number;
}

export interface DecisionTableResult {
  rows: DecisionTableRow[];
  page: number;
  pageSize: number;
  totalRows: number;
}

// Geo Intelligence Engine (Executive Map Redesign Spec, Phase 1) — mirrors
// geo-engine.schemas.ts. GeoFilters is deliberately field-for-field
// identical to DecisionFilters (see that schema's comment) but kept as its
// own type per this file's established one-interface-per-backend-schema
// convention.
export type GeoKpi = "sales" | "orders" | "customers" | "visits" | "collections" | "returns" | "lostSales";

export interface GeoFilters {
  dateFrom: string;
  dateTo: string;
  priorDateFrom?: string;
  priorDateTo?: string;
  branchIds?: string[];
  cityValues?: string[];
  channelValues?: string[];
  categoryValues?: string[];
  brandValues?: string[];
  productCodes?: string[];
  customerCodes?: string[];
  repEmails?: string[];
  supervisorEmails?: string[];
}

export type GeoGroupBy = "customer" | "city";

export interface GeoQueryInput extends GeoFilters {
  kpi: GeoKpi;
  groupBy: GeoGroupBy;
}

export interface GeoPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  value: number;
}

export interface GeoQueryResult {
  kpi: GeoKpi;
  groupBy: GeoGroupBy;
  points: GeoPoint[];
  maxValue: number;
  totalValue: number;
  totalRows: number;
  excludedBadCoordinates: number;
  // Phase 3 — reuses DecisionInsightItem as-is (identical shape, SGI-backed,
  // same reuse convention as decision-analytics-studio/territory-intelligence;
  // see geo-engine.schemas.ts's geoQueryResultSchema comment).
  insights: DecisionInsightItem[];
  datasetsAvailable: { invoices: boolean; collections: boolean; returns: boolean; visits: boolean };
  generatedAt: string;
}

// Phase 3 — Detail Table ("Invoice" step of the City -> Territory ->
// Customer -> Invoice drill chain). Field-for-field identical to
// DecisionTableQueryInput/DecisionTableRow/DecisionTableResult since
// GeoFilters already mirrors DecisionFilters.
export interface GeoTableQueryInput extends GeoFilters {
  page: number;
  pageSize: number;
}

export interface GeoTableRow {
  invoiceNo: string;
  lineNo: number;
  date: string | null;
  customerCode: string;
  customerName: string;
  city: string;
  channel: string;
  productCode: string;
  productName: string;
  category: string;
  brand: string;
  repName: string;
  supervisorName: string;
  amount: number;
}

export interface GeoTableResult {
  rows: GeoTableRow[];
  page: number;
  pageSize: number;
  totalRows: number;
}

export interface AuditLogEntry {
  id: string;
  companyId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
}

// Customer Location Capture — field-captured coordinates for companies whose
// Customers file has missing/incomplete lat/lon. See
// packages/schemas/src/customer-location.schemas.ts for the full rationale.
export interface CaptureCustomerLocationRequest {
  customerCode: string;
  customerName?: string;
  lat: number;
  lon: number;
}

export interface CustomerLocationRecord {
  id: string;
  customerCode: string;
  customerName: string | null;
  lat: number;
  lon: number;
  capturedByUserId: string;
  capturedByName: string;
  capturedAt: string;
}

// Plain free-text row search inside a single uploaded file — no column
// mapping required. Used by Customer Location Capture: the rep types a
// customer code/name, this returns the matching row(s) as-is (every column,
// whatever the file happens to have) so they can confirm on screen it's the
// right customer before a location gets saved against that code.
export interface FileSearchRow {
  [column: string]: unknown;
}

export interface FileSearchRowsResult {
  headers: string[];
  rows: FileSearchRow[];
}

// "استبدال ملف" — what got carried over automatically from the file being
// replaced. Post-ADR-001 the only per-file state left to carry over is
// SGI's saved file selection — hierarchy scoping is resolved fresh every
// time from the Canonical Routes/Employees Datasets, not from anything
// tied to a specific file id.
export interface ReplaceFileCarryOver {
  sgiConfigUpdated: boolean;
}

// Import Validation report — mirrors
// apps/api/src/modules/import-validation/import-validation.types.ts's
// ValidationReport/ValidationIssue. Kept loosely typed (string codes/level
// rather than the backend's literal unions) in keeping with this file's
// existing convention of not chasing the API's internal types 1:1 — the
// single-file-rejection toast (files page) has always treated
// ApiError.errors this way too.
export interface ValidationIssue {
  code: string;
  level: string;
  field?: string;
  row?: number;
  value?: unknown;
  message: string;
}

export interface ValidationReport {
  templateId: string;
  entity: string;
  fileName: string;
  valid: boolean;
  totalRows: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
  validatedAt: string;
  specVersion: string;
}

// Multi-sheet upload (2026-07-19) — one physical upload can contain up to
// 18 canonical entities across sheets. Each sheet named after an official
// entity is validated independently: it either lands in `accepted`, or it
// failed and lands in `rejected` (with a full ValidationReport when it
// failed structural validation, or just a `message` for other failures
// like duplicate sheet names for the same entity). Sheets not named after
// any official entity are silently skipped into `ignored` — not an error.
export interface FileRejectedSheetOutcome {
  sheetName: string;
  entity: string;
  report: ValidationReport | null;
  message?: string;
}

export interface FileIgnoredSheetOutcome {
  sheetName: string;
}

// Automatic employee-account provisioning (2026-07-19) — when an uploaded
// workbook's "Employees" sheet is accepted, the backend also provisions
// platform accounts from its rows. `tempPassword` appears in THIS response
// only, once, ever — the backend stores only a hash (explicit show-once
// product decision), so the Files screen must surface the passwords for
// copying before the admin dismisses them.
export interface ProvisionedAccount {
  email: string;
  fullName: string;
  roleCode: string;
  tempPassword: string;
}

export interface FileProvisioningResult {
  created: ProvisionedAccount[];
  updatedCount: number;
  // Human-readable Arabic reasons, one per skipped row — rendered as-is.
  skipped: string[];
}

export interface FileBatchUploadResult {
  batchId: string;
  fileName: string;
  accepted: FileRecord[];
  rejected: FileRejectedSheetOutcome[];
  ignored: FileIgnoredSheetOutcome[];
  // Present only when the upload contained an accepted Employees sheet.
  provisioning?: FileProvisioningResult;
}

export interface ReplaceFileResult {
  file: FileRecord;
  carryOver: ReplaceFileCarryOver | null;
  // Any OTHER entities the same upload also contained and successfully
  // imported alongside the one being replaced — usually empty (see
  // FilesService.replaceFile).
  otherAccepted: FileRecord[];
}

// AI Visit Copilot — Phase 1 (2026-07-19). Decision-support screen for the
// field rep: daily brief + plan ordering + per-customer visit briefing +
// contextual chat. Mirrors the /visit-copilot/* API contract by hand, same
// as everything else in this file. The Arabic strings inside the briefing
// (topOpportunity, suggestedGoal, actions, warnings) are ready-made server
// copy — the frontend renders them as-is.
export type VisitCopilotPeriod = "1m" | "3m" | "6m" | "12m" | "custom";
export type VisitCopilotPlanMode = "route" | "priority";

export interface VisitCopilotCustomer {
  customerCode: string;
  customerName: string;
  lat: number;
  lon: number;
  visitSequence: number;
  channel: string;
  avgOrderValue: number;
  lastVisitDate: string | null;
  priorityScore: number;
}

export interface VisitCopilotDailyBrief {
  date: string;
  weekday: string;
  isWorkingDay: boolean;
  visitCount: number;
  dailyTargetSales: number | null;
  expectedSalesTotal: number;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  customers: VisitCopilotCustomer[];
  warnings: string[];
}

export interface VisitCopilotPlanRequest {
  mode: VisitCopilotPlanMode;
  period: VisitCopilotPeriod;
  from?: string;
  to?: string;
}

export interface VisitCopilotPlanResult {
  mode: VisitCopilotPlanMode;
  customers: VisitCopilotCustomer[];
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
}

export interface VisitCopilotBriefingProduct {
  productCode: string;
  productName: string;
  qty: number;
  value: number;
}

export interface VisitCopilotMissingProduct {
  productCode: string;
  productName: string;
  reason: string;
}

export interface VisitCopilotBriefing {
  customerCode: string;
  customerName: string;
  // Phase 2: /visit-copilot/prospect-briefing/:id returns this SAME shape
  // with isProspect: true (zeros for sales/returns/collections render fine).
  isProspect?: boolean;
  period: { from: string; to: string };
  sales: { total: number; invoiceCount: number; trendPct: number };
  returns: { total: number; rate: number };
  collections: { collected: number; pending: number; bounced: number; oldestPendingDueDate: string | null };
  topProducts: VisitCopilotBriefingProduct[];
  missingProducts: VisitCopilotMissingProduct[];
  topOpportunity: string;
  suggestedGoal: string;
  actions: string[];
  warnings: string[];
}

export interface VisitCopilotChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface VisitCopilotChatRequest {
  // Exactly one of customerCode / prospectId is sent (Phase 2 added
  // prospect-mode chat; Phase 1 call sites keep sending customerCode).
  customerCode?: string;
  prospectId?: string;
  period: VisitCopilotPeriod;
  from?: string;
  to?: string;
  vanStock: boolean;
  message: string;
  history: VisitCopilotChatMessage[];
}

export interface VisitCopilotChatResponse {
  reply: string;
}

// AI Visit Copilot — Phase 2: Customer Discovery (2026-07-19). Map-based
// prospect discovery on demand: existing customers + scored prospects
// (uploaded or found via a discovery provider), route-fit opportunity
// summary after a plan is built, and a prospect visit mode reusing the
// Phase 1 briefing shape. `reason` arrives as ready-made server copy.
// source is free text server-side (provider-agnostic DB design) — "UPLOAD"
// plus whichever provider ids exist today ("OSM", "GOOGLE") or in future.
export type VisitCopilotProspectSource = "UPLOAD" | "OSM" | "GOOGLE" | (string & {});
export type VisitCopilotProspectStatus = "NEW" | "VISITED" | "IGNORED" | "CONVERTED";

export interface VisitCopilotDiscoveryCustomer {
  customerCode: string;
  name: string;
  lat: number;
  lon: number;
  channel: string;
  status: "existing";
}

export interface VisitCopilotProspect {
  id: string;
  source: VisitCopilotProspectSource;
  name: string;
  lat: number;
  lon: number;
  channel: string;
  status: VisitCopilotProspectStatus;
  priorityScore: number;
  expectedOrderValue: number;
  successProbability: number;
  reason: string;
  distanceKm: number;
}

export interface VisitCopilotDiscoveryResult {
  customers: VisitCopilotDiscoveryCustomer[];
  prospects: VisitCopilotProspect[];
  repChannel: string;
  warnings: string[];
}

export interface VisitCopilotGoogleSearchRequest {
  lat: number;
  lon: number;
  radiusMeters: number;
}

export interface VisitCopilotGoogleSearchResult {
  found: number;
  newCount: number;
  prospects: VisitCopilotProspect[];
  disabled?: boolean;
  message?: string;
}

export interface VisitCopilotRouteOpportunityBest {
  id: string;
  name: string;
  expectedOrderValue: number;
  addedMinutes: number;
  addedKm: number;
}

export interface VisitCopilotRouteOpportunities {
  highCount: number;
  mediumCount: number;
  best: VisitCopilotRouteOpportunityBest[];
  totalExpectedValue: number;
  disabled: boolean;
}
