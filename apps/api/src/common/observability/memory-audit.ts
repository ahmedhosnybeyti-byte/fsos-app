import { Logger } from "@nestjs/common";

// Temporary, opt-in production diagnostic. Enable only while sampling:
// MEMORY_AUDIT_ENABLED=true.
const enabled = process.env.MEMORY_AUDIT_ENABLED === "true";
const logger = new Logger("MemoryAudit");
const MB = 1024 * 1024;

type MemorySnapshot = { rssMB: number; heapUsedMB: number; heapTotalMB: number; externalMB: number; arrayBuffersMB: number };

function snapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  const toMB = (bytes: number) => Number((bytes / MB).toFixed(1));
  return { rssMB: toMB(usage.rss), heapUsedMB: toMB(usage.heapUsed), heapTotalMB: toMB(usage.heapTotal), externalMB: toMB(usage.external), arrayBuffersMB: toMB(usage.arrayBuffers) };
}

function higher(a: MemorySnapshot, b: MemorySnapshot): MemorySnapshot {
  return a.rssMB > b.rssMB ? a : b;
}

/** Logs before/peak/after plus a short delayed sample without retaining results. */
export async function auditMemory<T>(operation: string, work: () => Promise<T>, details: Record<string, unknown> = {}): Promise<T> {
  if (!enabled) return work();
  const before = snapshot();
  let peak = before;
  const sampler = setInterval(() => { peak = higher(peak, snapshot()); }, 25);
  sampler.unref();
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    peak = higher(peak, snapshot());
    clearInterval(sampler);
    const after = snapshot();
    logger.log(JSON.stringify({ event: "memory_audit", operation, phase: "complete", durationMs: Date.now() - startedAt, details, before, peak, after, deltaMB: Number((after.rssMB - before.rssMB).toFixed(1)), peakDeltaMB: Number((peak.rssMB - before.rssMB).toFixed(1)) }));
    const timer = setTimeout(() => {
      const settled = snapshot();
      logger.log(JSON.stringify({ event: "memory_audit", operation, phase: "settled", delayMs: 5000, details, before, after, settled, settledDeltaMB: Number((settled.rssMB - before.rssMB).toFixed(1)), heapReleasedMB: Number((after.heapUsedMB - settled.heapUsedMB).toFixed(1)), returnedNearBaseline: settled.heapUsedMB <= before.heapUsedMB + 3 }));
    }, 5000);
    timer.unref();
  }
}

export function auditMemoryCache(cache: string, details: Record<string, unknown>): void {
  if (enabled) logger.log(JSON.stringify({ event: "memory_audit_cache", cache, memory: snapshot(), details }));
}
