import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import {
  recordRieActiveVersionReuse,
  recordRieHierarchyReuse,
  recordRieSemaphoreAcquired,
  recordRieSemaphoreFailure,
  runWithRieSemaphoreContext,
} from "../../common/observability/rie-observability";

export const RIE_POSTGRES_CONCURRENCY = 20;
export const RIE_POSTGRES_QUEUE_TIMEOUT_MS = 30_000;
export const RIE_DEFAULT_POSTGRES_EXECUTION_BUDGET = 24;

type AcquireOptions = Readonly<{ signal?: AbortSignal; timeoutMs?: number }>;
type Permit = Readonly<{ activeCount: number; queueWaitMs: number; release: () => void }>;
type Waiter = Readonly<{
  resolve: (permit: Permit) => void;
  reject: (reason: Error) => void;
  cancel: () => void;
}>;

export class RieExecutionQueueTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for an RIE PostgreSQL execution slot.");
    this.name = "RieExecutionQueueTimeoutError";
  }
}

export class RieExecutionQueueCancelledError extends Error {
  constructor() {
    super("RIE PostgreSQL execution was cancelled while waiting for a slot.");
    this.name = "RieExecutionQueueCancelledError";
  }
}

export class RiePostgresExecutionBudgetExceededError extends Error {
  constructor(requestId: string, maxExecutions: number) {
    super(`RIE request "${requestId}" exceeded its ${maxExecutions}-PostgreSQL-execution budget.`);
    this.name = "RiePostgresExecutionBudgetExceededError";
  }
}

class FifoSemaphore {
  private activeCount = 0;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly limit: number) {}

  acquire({ signal, timeoutMs = RIE_POSTGRES_QUEUE_TIMEOUT_MS }: AcquireOptions = {}): Promise<Permit> {
    if (signal?.aborted) return Promise.reject(new RieExecutionQueueCancelledError());
    const queuedAt = Date.now();
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return Promise.resolve(this.permit(0));
    }

    return new Promise<Permit>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const remove = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        if (timeout) clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      };
      const fail = (reason: Error) => {
        if (settled) return;
        settled = true;
        remove();
        reject(reason);
      };
      const onAbort = () => fail(new RieExecutionQueueCancelledError());
      const waiter: Waiter = {
        resolve: (permit) => {
          if (settled) return;
          settled = true;
          remove();
          resolve({ activeCount: permit.activeCount, release: permit.release, queueWaitMs: Date.now() - queuedAt });
        },
        reject: fail,
        cancel: () => fail(new RieExecutionQueueCancelledError()),
      };
      this.waiters.push(waiter);
      if (timeoutMs > 0) timeout = setTimeout(() => fail(new RieExecutionQueueTimeoutError()), timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) waiter.cancel();
    });
  }

  private permit(queueWaitMs: number): Permit {
    let released = false;
    return {
      activeCount: this.activeCount,
      queueWaitMs,
      release: () => {
        if (released) return;
        released = true;
        const next = this.waiters.shift();
        if (next) next.resolve(this.permit(0));
        else this.activeCount -= 1;
      },
    };
  }
}

interface ActiveVersionState {
  resolved: Set<string>;
  counts: Map<string, number>;
  pending: Map<string, Promise<void>>;
}

interface RieExecutionRequestState {
  requestId: string;
  serialGate: FifoSemaphore;
  postgresExecutions: number;
  singleFlights: Map<string, Promise<unknown>>;
  activeVersions: Map<string, ActiveVersionState>;
}

interface RieExecutionRequestContext {
  state: RieExecutionRequestState;
  maxPostgresExecutions: number;
}

interface HeldExecutionLease {
  state: RieExecutionRequestState;
  nestedGate: FifoSemaphore;
}

const requestStorage = new AsyncLocalStorage<RieExecutionRequestContext>();
const leaseStorage = new AsyncLocalStorage<HeldExecutionLease>();
const processWidePostgresSemaphore = new FifoSemaphore(RIE_POSTGRES_CONCURRENCY);
let standaloneSequence = 0;

function createRequestState(requestId: string): RieExecutionRequestState {
  return {
    requestId,
    serialGate: new FifoSemaphore(1),
    postgresExecutions: 0,
    singleFlights: new Map(),
    activeVersions: new Map(),
  };
}

/**
 * Authoritative admission boundary for PostgreSQL work owned by RIE.
 *
 * The process-wide semaphore protects PostgreSQL with 20 permits, while the
 * request-local gate lets only one execution from a given HTTP/request context
 * enter that global queue at a time. Callers must wrap only the Prisma call;
 * hierarchy resolution, SQL construction and result processing stay outside.
 */
@Injectable()
export class RieExecutionCoordinatorService {
  runRequest<T>(requestId: string, execute: () => T): T {
    if (requestStorage.getStore()) return execute();
    return requestStorage.run({
      state: createRequestState(requestId),
      maxPostgresExecutions: RIE_DEFAULT_POSTGRES_EXECUTION_BUDGET,
    }, execute);
  }

  runWithBudget<T>(requestId: string, maxPostgresExecutions: number, execute: () => Promise<T>): Promise<T> {
    if (!Number.isInteger(maxPostgresExecutions) || maxPostgresExecutions < 1) {
      return Promise.reject(new Error("RIE PostgreSQL execution budget must be a positive integer."));
    }
    const current = requestStorage.getStore();
    if (!current) {
      return requestStorage.run({
        state: createRequestState(requestId),
        maxPostgresExecutions,
      }, execute);
    }
    const effectiveBudget = Math.min(current.maxPostgresExecutions, maxPostgresExecutions);
    return requestStorage.run({ ...current, maxPostgresExecutions: effectiveBudget }, execute);
  }

  hasRequestContext(): boolean {
    return requestStorage.getStore() !== undefined;
  }

  async execute<T>(operation: string, execute: () => Promise<T>, options: AcquireOptions = {}): Promise<T> {
    const current = requestStorage.getStore();
    if (!current) {
      standaloneSequence += 1;
      return this.runRequest(`standalone-rie-${standaloneSequence}`, () => this.execute(operation, execute, options));
    }

    // A PostgreSQL helper called from inside an already-admitted PostgreSQL
    // callback shares that exact lease. This is re-entrant and avoids a
    // self-deadlock; normal sibling Promise.all branches do not inherit one
    // another's lease and remain serialized by serialGate.
    const heldLease = leaseStorage.getStore();
    if (heldLease?.state === current.state) {
      const nestedPermit = await heldLease.nestedGate.acquire(options);
      try {
        this.reserveBudget(current);
        return await leaseStorage.run({
          state: current.state,
          nestedGate: new FifoSemaphore(1),
        }, execute);
      } finally {
        nestedPermit.release();
      }
    }

    const localPermit = await current.state.serialGate.acquire(options);
    let globalPermit: Permit | undefined;
    const queuedAt = Date.now();
    try {
      this.reserveBudget(current);
      try {
        globalPermit = await processWidePostgresSemaphore.acquire(options);
      } catch (error) {
        current.state.postgresExecutions -= 1;
        recordRieSemaphoreFailure(operation, error, Date.now() - queuedAt);
        throw error;
      }
      recordRieSemaphoreAcquired(operation, globalPermit.queueWaitMs, globalPermit.activeCount);
      return await leaseStorage.run({ state: current.state, nestedGate: new FifoSemaphore(1) }, () => runWithRieSemaphoreContext({
        operation,
        queueWaitMs: globalPermit!.queueWaitMs,
        activePermitCount: globalPermit!.activeCount,
      }, execute));
    } finally {
      globalPermit?.release();
      localPermit.release();
    }
  }

  executePrepared<TPrepared, TResult>(
    operation: string,
    prepare: () => TPrepared,
    execute: (prepared: TPrepared) => Promise<TResult>,
    options: AcquireOptions = {},
  ): Promise<TResult> {
    const prepared = prepare();
    return this.execute(operation, () => execute(prepared), options);
  }

  singleFlight<T>(namespace: string, key: string, resolve: () => Promise<T>): Promise<T> {
    const current = requestStorage.getStore();
    if (!current) return resolve();
    const cacheKey = `${namespace}\u0000${key}`;
    const existing = current.state.singleFlights.get(cacheKey);
    if (existing) return existing as Promise<T>;
    const pending = resolve();
    current.state.singleFlights.set(cacheKey, pending);
    void pending.catch(() => {
      if (current.state.singleFlights.get(cacheKey) === pending) current.state.singleFlights.delete(cacheKey);
    });
    return pending;
  }

  resolveHierarchy(
    companyId: string,
    roleCode: string,
    email: string,
    resolve: () => Promise<Set<string> | null>,
  ): Promise<Set<string> | null> {
    const current = requestStorage.getStore();
    if (!current) return resolve();
    const key = `${companyId}\u0000${roleCode}\u0000${email.trim().toLowerCase()}`;
    const cacheKey = `hierarchy\u0000${key}`;
    if (current.state.singleFlights.has(cacheKey)) recordRieHierarchyReuse();
    return this.singleFlight("hierarchy", key, resolve);
  }

  async resolveActiveVersionCounts(
    companyId: string,
    entityNames: readonly string[],
    resolve: (missingEntityNames: readonly string[]) => Promise<Map<string, number>>,
  ): Promise<Map<string, number>> {
    const current = requestStorage.getStore();
    if (!current) return resolve(entityNames);
    const uniqueNames = [...new Set(entityNames)].sort();
    const state = current.state.activeVersions.get(companyId) ?? {
      resolved: new Set<string>(),
      counts: new Map<string, number>(),
      pending: new Map<string, Promise<void>>(),
    };
    current.state.activeVersions.set(companyId, state);
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
          state.pending.delete(entityName);
        }
      }, (error) => {
        for (const entityName of missing) state.pending.delete(entityName);
        throw error;
      });
      for (const entityName of missing) state.pending.set(entityName, acquisition);
      waiting.push(acquisition);
    }
    await Promise.all(waiting);
    return new Map(uniqueNames.map((entityName) => [entityName, state.counts.get(entityName) ?? 0]));
  }

  private reserveBudget(context: RieExecutionRequestContext): void {
    const next = context.state.postgresExecutions + 1;
    if (next > context.maxPostgresExecutions) {
      throw new RiePostgresExecutionBudgetExceededError(context.state.requestId, context.maxPostgresExecutions);
    }
    context.state.postgresExecutions = next;
  }
}
