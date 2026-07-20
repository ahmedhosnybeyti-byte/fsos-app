// Behavioral k-means — pure computation, no I/O. Same Lloyd's-algorithm/
// k-means++ shape as route-planning/route-balancer.util.ts's geographic
// k-means, but over an arbitrary-length normalized feature vector with
// Euclidean distance instead of (lat, lon) with Haversine distance. Kept
// as its own small copy rather than generalizing the geographic version —
// the two have different distance functions and no other module needs a
// generic version, so sharing would add an abstraction with only one real
// caller each.

export function zScoreNormalize(vectors: number[][]): number[][] {
  const n = vectors.length;
  if (n === 0) return [];
  const dims = vectors[0]!.length;
  const means: number[] = new Array(dims).fill(0);
  for (const v of vectors) for (let d = 0; d < dims; d++) means[d] = (means[d] ?? 0) + v[d]! / n;

  const stds: number[] = new Array(dims).fill(0);
  for (const v of vectors) for (let d = 0; d < dims; d++) stds[d] = (stds[d] ?? 0) + (v[d]! - means[d]!) ** 2 / n;
  for (let d = 0; d < dims; d++) stds[d] = Math.sqrt(stds[d]!);

  return vectors.map((v) => v.map((x, d) => (stds[d]! > 0 ? (x - means[d]!) / stds[d]! : 0)));
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(sum);
}

export function kMeansVectors(vectors: number[][], k: number, restarts = 8, maxIterations = 100, seed = 7): number[] {
  const n = vectors.length;
  if (k >= n) return vectors.map((_, i) => Math.min(i, k - 1));

  let rngState = seed;
  const rand = () => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    rngState |= 0;
    return ((rngState >>> 0) % 1_000_000) / 1_000_000;
  };

  function runOnce(): { labels: number[]; inertia: number } {
    const centers: number[][] = [];
    centers.push(vectors[Math.floor(rand() * n)]!);
    while (centers.length < k) {
      const distSq = vectors.map((v) => Math.min(...centers.map((c) => euclidean(v, c) ** 2)));
      const total = distSq.reduce((a, b) => a + b, 0);
      if (total === 0) {
        centers.push(vectors[Math.floor(rand() * n)]!);
        continue;
      }
      let r = rand() * total;
      let idx = 0;
      for (; idx < n; idx++) {
        r -= distSq[idx]!;
        if (r <= 0) break;
      }
      centers.push(vectors[Math.min(idx, n - 1)]!);
    }

    let labels: number[] = new Array(n).fill(0);
    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;
      const newLabels = vectors.map((v) => {
        let best = 0;
        let bestDist = Infinity;
        for (let c = 0; c < k; c++) {
          const d = euclidean(v, centers[c]!);
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
        return best;
      });
      if (newLabels.some((v, i) => v !== labels[i])) changed = true;
      labels = newLabels;

      const dims = vectors[0]!.length;
      for (let c = 0; c < k; c++) {
        const members = vectors.filter((_, i) => labels[i] === c);
        if (members.length > 0) {
          centers[c] = Array.from({ length: dims }, (_, d) => members.reduce((s, v) => s + v[d]!, 0) / members.length);
        }
      }
      if (!changed) break;
    }

    const inertia = vectors.reduce((sum, v, i) => sum + euclidean(v, centers[labels[i]!]!) ** 2, 0);
    return { labels, inertia };
  }

  let best = runOnce();
  for (let r = 1; r < restarts; r++) {
    const candidate = runOnce();
    if (candidate.inertia < best.inertia) best = candidate;
  }
  return best.labels;
}
