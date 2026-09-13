import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import {
  recordRieActiveVersionReuse,
  recordRieHierarchyReuse,
  recordRieRequestPlanOperation,
  recordRieRequestPlanStarted,
} from "../../common/observability/rie-observability";

/**
 * A deliberately small, request-scoped orchestration layer for RIE.
 *
 * It owns only coordination metadata: operation permits, hierarchy route
 * sets, and active-version counts. It never retains fact rows or spans HTTP
 * requests. PostgreSQL remains responsible for all operational data work.
 */
export interface RieRequestPlanOptions {
  name: string;
  maxConcurrentOperations?: number;
  maxOperations?: number;
}

export class RieRequestBudgetExceededError extends Error {
  constructor(planName: string, maxOperations: number) {
    super(`RIE request plan "${planName}" exceeded its ${maxOperations}-operation budget.`);
    this.name = "RieRequestBudgetExceededError";
  }
}

interface PendingOperation {
  operation: string;
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  queuedAt: number;
}

interface ActiveVersionState {
  resolved: Set<string>;
  counts: Map<string, number>;
  pending: Map<string, Promise<void>>;
}

class RequestPlan {
  readonly hierarchy = new Map<string, Promise<Set<string> | null>>();
  readonly activeVersions = new Map<string, ActiveVersionState>();
  readonly pending: PendingOperation[] = [];
  activeOperations = 0;
  submittedOperations = 0;

  constructor(
    readonly name: string,
    readonly maxConcurrentOperations: number,
    readonly maxOperations: number,
  ) {}
}

const storage = new AsyncLocalStorage<RequestPlan>();
const DEFAULT_MAX_CONCURRENT_OPERATIONS = 3;
const DEFAULT_MAX_OPERATIONS = 24;

@Injectable()
export class RieRequestPlannerService {
  runPlan<T>(options: RieRequestPlanOptions, execute: () => Promise<T>): Promise<T> {
    // Nested consumers join the same action budget rather than silently
    // creating a second request plan with a separate fan-out allowance.
    if (storage.getStore()) return execute();
    const maxConcurrentOperations = options.maxConcurrentOperations ?? DEFAULT_MAX_CONCURRENT_OPERATIONS;
    const maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS;
    if (!Number.isInteger(maxConcurrentOperations) || maxConcurrentOperations < 1) throw new Error("RIE request plan requires a positive concurrency budget.");
    if (!Number.isInteger(maxOperations) || maxOperations < 1) throw new Error("RIE request plan requires a positive operation budget.");
    const plan = new RequestPlan(options.name, maxConcurrentOperations, maxOperations);
    recordRieRequestPlanStarted(options.name, maxConcurrentOperations, maxOperations);
    return storage.run(plan, execute);
  }

  execute<T>(operation: string, execute: () => Promise<T>): Promise<T> {
    const plan = storage.getStore();
    if (!plan) return execute();
    if (plan.submittedOperations >= plan.maxOperations) {
      recordRieRequestPlanOperation(operation, 0, plan.activeOperations, true);
      return Promise.reject(new RieRequestBudgetExceededError(plan.name, plan.maxOperations));
    }
    plan.submittedOperations += 1;
    return new Promise<T>((resolve, reject) => {
      plan.pending.push({ operation, execute, resolve: (value) => resolve(value as T), reject, queuedAt: Date.now() });
      this.drain(plan);
    });
  }

  resolveHierarchy(
    companyId: string,
    roleCode: string,
    email: string,
    resolve: () => Promise<Set<string> | null>,
  ): Promise<Set<string> | null> {
    const plan = storage.getStore();
    if (!plan) return resolve();
    const key = `${companyId}\u0000${roleCode}\u0000${email.trim().toLowerCase()}`;
    const existing = plan.hierarchy.get(key);
    if (existing) {
      recordRieHierarchyReuse();
      return existing;
    }
    const acquisition = resolve();
    plan.hierarchy.set(key, acquisition);
    return acquisition;
  }

  async resolveActiveVersionCounts(
    companyId: string,
    entityNames: readonly string[],
    resolve: (missingEntityNames: readonly string[]) => Promise<Map<string, number>>,
  ): Promise<Map<string, number>> {
    const plan = storage.getStore();
    if (!plan) return resolve(entityNames);
    const uniqueNames = [...new Set(entityNames)].sort();
    const state = plan.activeVersions.get(companyId) ?? { resolved: new Set<string>(), counts: new Map<string, number>(), pending: new Map<string, Promise<void>>() };
    plan.activeVersions.set(companyId, state);
    const waiting: Promise<void>[] = [];
    const missing: string[] = [];
    for (const entityName of uniqueNames) {
      if (state.resolved.has(entityName)) {
        recordRieActiveVersionReuse();
      } else {
        const pending = state.pending.get(entityName);
        if (pending) {
          recordRieActiveVersionReuse();
          waiting.push(pending);
        } else {
          missing.push(entityName);
        }
      }
    }
    if (missing.length) {
      const acquisition = resolve(missing).then((counts) => {
        for (const entityName of missing) {
          state.counts.set(entityName, counts.get(entityName) ?? 0);
          state.resolved.add(entityName);
        }
      });
      for (const entityName of missing) state.pending.set(entityName, acquisition);
      waiting.push(acquisition);
    }
    await Promise.all(waiting);
    return new Map(uniqueNames.map((entityName) => [entityName, state.counts.get(entityName) ?? 0]));
  }

  private drain(plan: RequestPlan): void {
    while (plan.activeOperations < plan.maxConcurrentOperations && plan.pending.length) {
      const pending = plan.pending.shift()!;
      plan.activeOperations += 1;
      const queueWaitMs = Date.now() - pending.queuedAt;
      recordRieRequestPlanOperation(pending.operation, queueWaitMs, plan.activeOperations, false);
      void pending.execute().then(pending.resolve, pending.reject).finally(() => {
        plan.activeOperations -= 1;
        this.drain(plan);
      });
    }
  }
}
