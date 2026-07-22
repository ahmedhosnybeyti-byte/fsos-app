// Pluggable, country-agnostic boundary-asset registry (Territory Intelligence
// polygon-choropleth redesign). The client's hard mandate was that the
// boundary-polygon data source must be swappable per-country without any UI
// or architecture change — this file is the single seam that makes that
// true: add an entry here, drop a FeatureCollection under /public, and no
// other code (map component, hierarchy engine, page) needs to change.
//
// No backend/API involvement — boundary assets are plain static Next.js
// `public/` files, fetched at runtime like any other static asset.

// @types/geojson / the `geojson` package are not a dependency of this
// workspace (see apps/web/package.json) — hand-rolled minimal structural
// type covering exactly what this feature needs, rather than pulling in a
// new dependency for a handful of fields.
export interface GeoJsonFeatureLike {
  type: "Feature";
  properties: { name: string; [key: string]: unknown } | null;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    // Polygon: number[][][]  (rings of [lon, lat] positions)
    // MultiPolygon: number[][][][]
    coordinates: unknown;
  };
}

export interface GeoJsonFeatureCollectionLike {
  type: "FeatureCollection";
  features: GeoJsonFeatureLike[];
}

export interface BoundaryRegistryEntry {
  /** Lowercased substrings matched against CompanyProfileData.country (also lowercased). First match wins. */
  countryMatch: string[];
  /** Path under /public this country's boundary FeatureCollection lives at. */
  assetUrl: string;
}

// Add more entries here as real boundary datasets become available for other
// countries — no other code needs to change when a new country is added.
export const BOUNDARY_REGISTRY: BoundaryRegistryEntry[] = [
  { countryMatch: ["saudi", "سعود", "ksa", " sa", "sa "], assetUrl: "/geo-boundaries/SA.geojson" },
];

export function resolveBoundaryAssetUrl(companyCountry: string | null | undefined): string | null {
  if (!companyCountry) return null;
  const normalized = companyCountry.trim().toLowerCase();
  if (!normalized) return null;
  for (const entry of BOUNDARY_REGISTRY) {
    if (entry.countryMatch.some((substring) => normalized.includes(substring))) {
      return entry.assetUrl;
    }
  }
  return null;
}

export interface BoundaryFeatureIndex {
  /** Keyed by a normalized territory name (see normalizeTerritoryName), value = the raw GeoJSON Feature (Polygon or MultiPolygon geometry). */
  byName: Map<string, GeoJsonFeatureLike>;
}

const EMPTY_INDEX: BoundaryFeatureIndex = { byName: new Map() };

export function normalizeTerritoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ").normalize("NFC");
}

// Module-level cache keyed by assetUrl — repeated calls (re-renders, remounts
// of the map component) reuse the already-fetched/parsed index instead of
// re-fetching. Caches the in-flight promise too, so concurrent callers during
// the same load don't trigger duplicate fetches.
const boundaryIndexCache = new Map<string, Promise<BoundaryFeatureIndex>>();

export async function loadBoundaryIndex(assetUrl: string): Promise<BoundaryFeatureIndex> {
  const cached = boundaryIndexCache.get(assetUrl);
  if (cached) return cached;

  const promise = (async (): Promise<BoundaryFeatureIndex> => {
    try {
      const res = await fetch(assetUrl);
      if (!res.ok) return EMPTY_INDEX;
      const data = (await res.json()) as GeoJsonFeatureCollectionLike;
      if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) return EMPTY_INDEX;

      const byName = new Map<string, GeoJsonFeatureLike>();
      for (const feature of data.features) {
        const name = feature?.properties?.name;
        if (typeof name !== "string" || !name) continue;
        byName.set(normalizeTerritoryName(name), feature);
      }
      return { byName };
    } catch {
      // A missing/broken boundary file must never crash the screen — every
      // territory just falls back to a generated polygon shape instead.
      return EMPTY_INDEX;
    }
  })();

  boundaryIndexCache.set(assetUrl, promise);
  return promise;
}
