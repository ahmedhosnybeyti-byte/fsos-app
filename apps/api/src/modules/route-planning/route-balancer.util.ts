// Balanced territory/route split algorithm — pure computation, no I/O.
//
// Two-phase design, arrived at through several rounds of testing against
// real field-sales data (see docs/PROJECT_LOG.md's "Route-splitting /
// territory design" section for the full history):
//
//   Phase 1 — geographic seed: plain k-means on (lat, lon) only. This is
//   the "before" state — compact, contiguous groups with zero regard for
//   sales value.
//
//   Phase 2 — region growth: starting from those same geographic groups,
//   any group under its per-group sales target grows by absorbing ONLY its
//   nearest unclaimed neighbor (a customer currently in an over-target
//   "donor" group). Never a jump to a distant customer. This is a
//   deliberate constraint, not a limitation of the balancing step — an
//   earlier version allowed free swaps to any customer within a radius,
//   which reached tighter balance numerically but could visually "orphan"
//   a customer deep inside a neighboring group's territory. Region growth
//   guarantees every group stays a single contiguous blob on the map.
//
// Distance is straight-line (Haversine), not drive time — drive time was
// explicitly rejected as a basis (traffic makes it non-reproducible), and
// Haversine needs no external routing API/cost.

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLon, b: LatLon): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const dLambda = ((b.lon - a.lon) * Math.PI) / 180;
  const sinDPhi = Math.sin(dPhi / 2);
  const sinDLambda = Math.sin(dLambda / 2);
  const h = sinDPhi * sinDPhi + Math.cos(p1) * Math.cos(p2) * sinDLambda * sinDLambda;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Minimal k-means (Lloyd's algorithm, multiple random restarts, keep the
// lowest-inertia run). No external ML dependency needed at this data scale
// (a few thousand points at most — see ROUTE_PLANNING_LIMITS.maxCustomersPerRequest).
function kMeans(points: LatLon[], k: number, restarts = 8, maxIterations = 100, seed = 42): number[] {
  const n = points.length;
  if (k >= n) {
    // Degenerate case: not enough points for k distinct clusters — assign
    // one point per cluster, remaining points to cluster 0.
    return points.map((_, i) => Math.min(i, k - 1));
  }

  let rngState = seed;
  const rand = () => {
    // xorshift32 — deterministic, no dependency, good enough for k-means init.
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    rngState |= 0;
    return ((rngState >>> 0) % 1_000_000) / 1_000_000;
  };

  function runOnce(): { labels: number[]; inertia: number } {
    // k-means++ style seeding: first center random, subsequent centers
    // weighted by squared distance to the nearest existing center.
    const centers: LatLon[] = [];
    centers.push(points[Math.floor(rand() * n)]);
    while (centers.length < k) {
      const distSq = points.map((p) => Math.min(...centers.map((c) => haversineKm(p, c) ** 2)));
      const total = distSq.reduce((a, b) => a + b, 0);
      if (total === 0) {
        centers.push(points[Math.floor(rand() * n)]);
        continue;
      }
      let r = rand() * total;
      let idx = 0;
      for (; idx < n; idx++) {
        r -= distSq[idx];
        if (r <= 0) break;
      }
      centers.push(points[Math.min(idx, n - 1)]);
    }

    let labels = new Array(n).fill(0);
    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;
      const newLabels = points.map((p) => {
        let best = 0;
        let bestDist = Infinity;
        for (let c = 0; c < k; c++) {
          const d = haversineKm(p, centers[c]);
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
        return best;
      });
      if (newLabels.some((v, i) => v !== labels[i])) changed = true;
      labels = newLabels;

      for (let c = 0; c < k; c++) {
        const members = points.filter((_, i) => labels[i] === c);
        if (members.length > 0) {
          centers[c] = {
            lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
            lon: members.reduce((s, p) => s + p.lon, 0) / members.length,
          };
        }
      }
      if (!changed) break;
    }

    const inertia = points.reduce((sum, p, i) => sum + haversineKm(p, centers[labels[i]]) ** 2, 0);
    return { labels, inertia };
  }

  let best = runOnce();
  for (let r = 1; r < restarts; r++) {
    const candidate = runOnce();
    if (candidate.inertia < best.inertia) best = candidate;
  }
  return best.labels;
}

export interface RegionGrowInput {
  points: LatLon[];
  values: number[]; // sales value per point, same order as `points`
  groupCount: number;
  tolerance: number; // fraction of target, e.g. 0.01 = stop within 1%
  maxIterations?: number;
}

export interface RegionGrowResult {
  before: number[]; // pure geographic k-means labels
  after: number[]; // region-grown labels
  target: number;
  beforeTotals: number[];
  afterTotals: number[];
}

export function balancedRegionGrow(input: RegionGrowInput): RegionGrowResult {
  const { points, values, groupCount, tolerance } = input;
  const maxIterations = input.maxIterations ?? 5000;
  const n = points.length;
  const target = values.reduce((a, b) => a + b, 0) / groupCount;

  const before = kMeans(points, groupCount);
  const after = before.slice();

  // Precompute the full pairwise distance matrix once — every "who's the
  // nearest neighbor" lookup during growth reuses it instead of
  // recomputing Haversine distances every iteration.
  const D: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    D[i] = new Array(n);
    for (let j = 0; j < n; j++) {
      D[i][j] = i === j ? 0 : haversineKm(points[i], points[j]);
    }
  }

  function totalsOf(labels: number[]): number[] {
    const t = new Array(groupCount).fill(0);
    for (let i = 0; i < n; i++) t[labels[i]] += values[i];
    return t;
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    const totals = totalsOf(after);
    const dev = totals.map((t) => t - target);
    const order = dev
      .map((d, idx) => ({ d, idx }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.idx);

    let moved = false;
    for (const U of order) {
      if (dev[U] >= -tolerance * target) continue; // U is already at/above target

      const donors = new Set<number>();
      for (let c = 0; c < groupCount; c++) {
        if (c !== U && totals[c] > target * (1 + tolerance)) donors.add(c);
      }
      const donorSet = donors.size > 0 ? donors : new Set(Array.from({ length: groupCount }, (_, c) => c).filter((c) => c !== U));

      const uMembers: number[] = [];
      for (let i = 0; i < n; i++) if (after[i] === U) uMembers.push(i);
      if (uMembers.length === 0) continue;

      let bestCandidate = -1;
      let bestDist = Infinity;
      for (let i = 0; i < n; i++) {
        if (after[i] === U || !donorSet.has(after[i])) continue;
        let minDist = Infinity;
        for (const m of uMembers) {
          const d = D[i][m];
          if (d < minDist) minDist = d;
        }
        if (minDist < bestDist) {
          bestDist = minDist;
          bestCandidate = i;
        }
      }

      if (bestCandidate === -1) continue;
      after[bestCandidate] = U;
      moved = true;
      break;
    }

    if (!moved) break;
  }

  return {
    before,
    after,
    target,
    beforeTotals: totalsOf(before),
    afterTotals: totalsOf(after),
  };
}
