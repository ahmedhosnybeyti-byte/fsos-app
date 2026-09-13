import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Logger } from "@nestjs/common";

type RieGovernance = "semaphore" | "direct";
type RieOutcome = "success" | "error" | "timeout" | "cancelled";

export interface RieRequestIdentity {
  traceId: string;
  feature: string;
  action: string;
  routeTemplate: string;
}

export interface RieScopeMetadata {
  companyId?: string;
  roleCode?: string;
  hasDate?: boolean;
  hasRoute?: boolean;
  hasRep?: boolean;
  hasCustomer?: boolean;
  hasProduct?: boolean;
  hasHierarchy?: boolean;
}

interface RieRequestCounters {
  rieLogicalOperationCount: number;
  sqlOperationCount: number;
  semaphoreAcquisitionCount: number;
  directSqlOperationCount: number;
  queueWaitTotalMs: number;
  queueWaitMaxMs: number;
  maxActivePermitCount: number;
  sqlDurationTotalMs: number;
  sqlDurationMaxMs: number;
  rowsReturnedTotal: number;
  hierarchyResolutionCount: number;
  allowedRouteCount: number;
  versionResolutionCount: number;
  activeVersionEntityCount: number;
  activeSourceVersionCount: number;
  timeoutCount: number;
  cancellationCount: number;
}

interface RieRequestTrace extends RieRequestIdentity, RieRequestCounters {
  startedAt: number;
  operationSequence: number;
  detailed: boolean;
  finished: boolean;
  roleCode: string;
  companyKey: string;
  scopeFlags: Required<Pick<RieScopeMetadata, "hasDate" | "hasRoute" | "hasRep" | "hasCustomer" | "hasProduct" | "hasHierarchy">>;
}

interface RieSemaphoreContext {
  operation: string;
  queueWaitMs: number;
  activePermitCount: number;
}

interface RieAsyncContext {
  root: RieRequestTrace;
  facadeOperation?: string;
  facadeOperationId?: string;
  semaphore?: RieSemaphoreContext;
}

type TelemetryPayload = Readonly<Record<string, unknown>>;
type TelemetrySink = (payload: TelemetryPayload) => void;

const logger = new Logger("RieObservability");
const requestStorage = new AsyncLocalStorage<RieAsyncContext>();
const DEFAULT_DETAIL_SAMPLE_RATE = 0.03;
let testSink: TelemetrySink | undefined;
let testDetailSampleRate: number | undefined;

const emptyCounters = (): RieRequestCounters => ({
  rieLogicalOperationCount: 0,
  sqlOperationCount: 0,
  semaphoreAcquisitionCount: 0,
  directSqlOperationCount: 0,
  queueWaitTotalMs: 0,
  queueWaitMaxMs: 0,
  maxActivePermitCount: 0,
  sqlDurationTotalMs: 0,
  sqlDurationMaxMs: 0,
  rowsReturnedTotal: 0,
  hierarchyResolutionCount: 0,
  allowedRouteCount: 0,
  versionResolutionCount: 0,
  activeVersionEntityCount: 0,
  activeSourceVersionCount: 0,
  timeoutCount: 0,
  cancellationCount: 0,
});

function configuredSampleRate(): number {
  if (testDetailSampleRate !== undefined) return testDetailSampleRate;
  const configured = Number(process.env.RIE_OBSERVABILITY_DETAIL_SAMPLE_RATE ?? DEFAULT_DETAIL_SAMPLE_RATE);
  return Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : DEFAULT_DETAIL_SAMPLE_RATE;
}

function safeEmit(payload: TelemetryPayload): void {
  try {
    if (testSink) testSink(payload);
    else logger.log(JSON.stringify(payload));
  } catch {
    // Telemetry is deliberately fail-open: it must never affect a request.
  }
}

function durationMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

function companyKey(companyId: string): string {
  return createHash("sha256").update(companyId).digest("hex").slice(0, 16);
}

function nextOperationId(root: RieRequestTrace): string {
  root.operationSequence += 1;
  return `${root.traceId}:${root.operationSequence}`;
}

function failureClass(error: unknown): "timeout" | "cancelled" | "database" | "error" {
  const name = error instanceof Error ? error.name : "";
  if (/timeout/i.test(name)) return "timeout";
  if (/cancel/i.test(name) || /abort/i.test(name)) return "cancelled";
  if (/prisma|database|query/i.test(name)) return "database";
  return "error";
}

function mergeScope(root: RieRequestTrace, scope?: RieScopeMetadata): void {
  if (!scope) return;
  if (scope.companyId && !root.companyKey) root.companyKey = companyKey(scope.companyId);
  if (scope.roleCode && root.roleCode === "unknown") root.roleCode = scope.roleCode;
  for (const key of ["hasDate", "hasRoute", "hasRep", "hasCustomer", "hasProduct", "hasHierarchy"] as const) {
    if (scope[key]) root.scopeFlags[key] = true;
  }
}

export function classifyRieHttpAction(method: string, path: string): Pick<RieRequestIdentity, "feature" | "action" | "routeTemplate"> {
  const normalizedMethod = method.toUpperCase();
  if (/\/smart-loading\/session\/?$/.test(path)) return { feature: "smart_loading", action: "get_session", routeTemplate: "/smart-loading/session" };
  if (path.includes("/decision-analytics-studio/fsos-360")) return { feature: "fsos360", action: "query", routeTemplate: "/decision-analytics-studio/fsos-360" };
  if (path.includes("/decision-analytics-studio")) return { feature: "decision_analytics", action: "query", routeTemplate: "/decision-analytics-studio" };
  if (path.includes("/team-performance")) return { feature: "team_performance", action: "query", routeTemplate: "/team-performance" };
  if (path.includes("/visit-copilot/daily-brief")) return { feature: "visit_copilot", action: "daily_brief", routeTemplate: "/visit-copilot/daily-brief" };
  if (path.includes("/visit-copilot")) return { feature: "visit_copilot", action: normalizedMethod === "GET" ? "read" : "write", routeTemplate: "/visit-copilot" };
  return { feature: "rie_other", action: normalizedMethod === "GET" ? "read" : "write", routeTemplate: "/rie-other" };
}

export function runWithRieRequestContext<T>(identity: RieRequestIdentity, execute: () => T): T {
  const root: RieRequestTrace = {
    ...identity,
    ...emptyCounters(),
    startedAt: performance.now(),
    operationSequence: 0,
    detailed: Math.random() < configuredSampleRate(),
    finished: false,
    roleCode: "unknown",
    companyKey: "",
    scopeFlags: { hasDate: false, hasRoute: false, hasRep: false, hasCustomer: false, hasProduct: false, hasHierarchy: false },
  };
  return requestStorage.run({ root }, execute);
}

export function completeRieRequest(statusCode: number): void {
  const root = requestStorage.getStore()?.root;
  if (!root || root.finished) return;
  root.finished = true;
  if (root.rieLogicalOperationCount === 0 && root.sqlOperationCount === 0 && root.hierarchyResolutionCount === 0) return;
  const outcome: RieOutcome = root.cancellationCount > 0 ? "cancelled" : root.timeoutCount > 0 || statusCode === 504 ? "timeout" : statusCode >= 400 ? "error" : "success";
  safeEmit({
    event: "rie_request_summary",
    schemaVersion: 1,
    traceId: root.traceId,
    feature: root.feature,
    action: root.action,
    routeTemplate: root.routeTemplate,
    roleCode: root.roleCode,
    companyKey: root.companyKey || "unknown",
    scopeFlags: root.scopeFlags,
    durationMs: durationMs(root.startedAt),
    rieLogicalOperationCount: root.rieLogicalOperationCount,
    sqlOperationCount: root.sqlOperationCount,
    semaphoreAcquisitionCount: root.semaphoreAcquisitionCount,
    directSqlOperationCount: root.directSqlOperationCount,
    queueWaitTotalMs: Number(root.queueWaitTotalMs.toFixed(3)),
    queueWaitMaxMs: Number(root.queueWaitMaxMs.toFixed(3)),
    maxActivePermitCount: root.maxActivePermitCount,
    sqlDurationTotalMs: Number(root.sqlDurationTotalMs.toFixed(3)),
    sqlDurationMaxMs: Number(root.sqlDurationMaxMs.toFixed(3)),
    rowsReturnedTotal: root.rowsReturnedTotal,
    hierarchyResolutionCount: root.hierarchyResolutionCount,
    allowedRouteCount: root.allowedRouteCount,
    versionResolutionCount: root.versionResolutionCount,
    activeVersionEntityCount: root.activeVersionEntityCount,
    activeSourceVersionCount: root.activeSourceVersionCount,
    timeoutCount: root.timeoutCount,
    cancellationCount: root.cancellationCount,
    outcome,
  });
}

export function markRieRequestCancelled(): void {
  const root = requestStorage.getStore()?.root;
  if (root) root.cancellationCount += 1;
}

export async function observeRieLogicalOperation<T>(operation: string, scope: RieScopeMetadata | undefined, execute: () => Promise<T>): Promise<T> {
  const store = requestStorage.getStore();
  if (!store) return execute();
  mergeScope(store.root, scope);
  store.root.rieLogicalOperationCount += 1;
  const operationId = nextOperationId(store.root);
  const startedAt = performance.now();
  try {
    const result = await requestStorage.run({ ...store, facadeOperation: operation, facadeOperationId: operationId }, execute);
    if (store.root.detailed) safeEmit({ event: "rie_operation", schemaVersion: 1, traceId: store.root.traceId, operationId, layer: "facade", operation, durationMs: durationMs(startedAt), outcome: "success" });
    return result;
  } catch (error) {
    safeEmit({ event: "rie_operation", schemaVersion: 1, traceId: store.root.traceId, operationId, layer: "facade", operation, durationMs: durationMs(startedAt), outcome: failureClass(error), failureClass: failureClass(error) });
    throw error;
  }
}

export async function observeRiePostgres<T>(operation: string, queryFingerprint: string, governance: RieGovernance, execute: () => Promise<T>): Promise<T> {
  const store = requestStorage.getStore();
  if (!store) return execute();
  const root = store.root;
  const effectiveGovernance = store.semaphore ? "semaphore" : governance;
  root.sqlOperationCount += 1;
  if (effectiveGovernance === "direct") root.directSqlOperationCount += 1;
  const operationId = nextOperationId(root);
  const startedAt = performance.now();
  try {
    const result = await execute();
    const elapsed = durationMs(startedAt);
    const rowsReturned = Array.isArray(result) ? result.length : result === null || result === undefined ? 0 : 1;
    root.sqlDurationTotalMs += elapsed;
    root.sqlDurationMaxMs = Math.max(root.sqlDurationMaxMs, elapsed);
    root.rowsReturnedTotal += rowsReturned;
    if (root.detailed) safeEmit({
      event: "rie_operation", schemaVersion: 1, traceId: root.traceId, operationId, parentOperationId: store.facadeOperationId,
      layer: "postgres", operation, facadeOperation: store.facadeOperation ?? "unknown", queryFingerprint,
      governance: effectiveGovernance, queueWaitMs: store.semaphore?.queueWaitMs ?? 0,
      activePermitCount: store.semaphore?.activePermitCount ?? 0, sqlDurationMs: elapsed, rowsReturned, outcome: "success",
    });
    return result;
  } catch (error) {
    const elapsed = durationMs(startedAt);
    root.sqlDurationTotalMs += elapsed;
    root.sqlDurationMaxMs = Math.max(root.sqlDurationMaxMs, elapsed);
    const classified = failureClass(error);
    if (classified === "timeout") root.timeoutCount += 1;
    if (classified === "cancelled") root.cancellationCount += 1;
    safeEmit({
      event: "rie_operation", schemaVersion: 1, traceId: root.traceId, operationId, parentOperationId: store.facadeOperationId,
      layer: "postgres", operation, facadeOperation: store.facadeOperation ?? "unknown", queryFingerprint,
      governance: effectiveGovernance, queueWaitMs: store.semaphore?.queueWaitMs ?? 0,
      activePermitCount: store.semaphore?.activePermitCount ?? 0, sqlDurationMs: elapsed, rowsReturned: 0,
      outcome: classified, failureClass: classified,
    });
    throw error;
  }
}

export function recordRieSemaphoreAcquired(operation: string, queueWaitMs: number, activePermitCount: number): void {
  const store = requestStorage.getStore();
  if (!store) return;
  const root = store.root;
  root.semaphoreAcquisitionCount += 1;
  root.queueWaitTotalMs += queueWaitMs;
  root.queueWaitMaxMs = Math.max(root.queueWaitMaxMs, queueWaitMs);
  root.maxActivePermitCount = Math.max(root.maxActivePermitCount, activePermitCount);
  if (root.detailed) safeEmit({
    event: "rie_operation", schemaVersion: 1, traceId: root.traceId, operationId: nextOperationId(root),
    parentOperationId: store.facadeOperationId, layer: "semaphore", operation,
    queueWaitMs: Number(queueWaitMs.toFixed(3)), activePermitCount, outcome: "success",
  });
}

export function recordRieSemaphoreFailure(operation: string, error: unknown, queueWaitMs: number): void {
  const store = requestStorage.getStore();
  if (!store) return;
  const classified = failureClass(error);
  store.root.queueWaitTotalMs += queueWaitMs;
  store.root.queueWaitMaxMs = Math.max(store.root.queueWaitMaxMs, queueWaitMs);
  if (classified === "timeout") store.root.timeoutCount += 1;
  if (classified === "cancelled") store.root.cancellationCount += 1;
  safeEmit({
    event: "rie_operation", schemaVersion: 1, traceId: store.root.traceId, operationId: nextOperationId(store.root),
    parentOperationId: store.facadeOperationId, layer: "semaphore", operation,
    queueWaitMs: Number(queueWaitMs.toFixed(3)), activePermitCount: 0,
    outcome: classified, failureClass: classified,
  });
}

export function runWithRieSemaphoreContext<T>(semaphore: RieSemaphoreContext, execute: () => Promise<T>): Promise<T> {
  const store = requestStorage.getStore();
  return store ? requestStorage.run({ ...store, semaphore }, execute) : execute();
}

export async function observeHierarchyResolution<T extends Set<string> | null>(scope: RieScopeMetadata, execute: () => Promise<T>): Promise<T> {
  const store = requestStorage.getStore();
  if (!store) return execute();
  mergeScope(store.root, { ...scope, hasHierarchy: true });
  store.root.hierarchyResolutionCount += 1;
  const result = await execute();
  store.root.allowedRouteCount += result?.size ?? 0;
  return result;
}

export function recordActiveVersionResolution(entityCount: number, activeSourceVersionCount: number): void {
  const root = requestStorage.getStore()?.root;
  if (!root) return;
  root.versionResolutionCount += 1;
  root.activeVersionEntityCount += entityCount;
  root.activeSourceVersionCount += activeSourceVersionCount;
}

export function fingerprintRieQueryShape(shape: unknown): string {
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 16);
}

export function scopeMetadata(input: {
  companyId?: string;
  requestingUser?: { roleCode?: string };
  scope?: { date?: unknown; dateAny?: unknown; route?: unknown; rep?: unknown; customer?: unknown; product?: unknown; fields?: unknown };
  routeIds?: unknown;
  salesRepId?: unknown;
  customerCodes?: unknown;
  productCodes?: unknown;
}): RieScopeMetadata {
  return {
    companyId: input.companyId,
    roleCode: input.requestingUser?.roleCode,
    hasDate: Boolean(input.scope?.date || input.scope?.dateAny),
    hasRoute: Boolean(input.scope?.route || input.routeIds),
    hasRep: Boolean(input.scope?.rep || input.salesRepId),
    hasCustomer: Boolean(input.scope?.customer || input.customerCodes),
    hasProduct: Boolean(input.scope?.product || input.productCodes),
    hasHierarchy: Boolean(input.requestingUser),
  };
}

/** Test-only hook: returns a restore function and never affects production defaults. */
export function setRieTelemetryTestSink(sink: TelemetrySink | undefined, detailSampleRate = 1): () => void {
  const previousSink = testSink;
  const previousRate = testDetailSampleRate;
  testSink = sink;
  testDetailSampleRate = detailSampleRate;
  return () => { testSink = previousSink; testDetailSampleRate = previousRate; };
}
