// Customer Discovery — provider-based architecture. "Search around me" is
// pluggable: the service picks a ProspectDiscoveryProvider per company
// (CompanyProfile.discoveryProvider — "OSM" default, "GOOGLE" with the
// company's own key) and all the FSOS post-processing (existing-customer
// exclusion, Prospect upserts, scoring) stays provider-agnostic.

export interface DiscoveredPlace {
  // Provider-unique id, namespaced by construction: Google uses the raw
  // Places id, OSM uses "osm-{type}-{id}" — the prefix keeps the two
  // vocabularies from ever colliding inside the shared Prospect table.
  externalKey: string;
  name: string;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
}

export interface DiscoverySearchParams {
  lat: number;
  lon: number;
  radiusMeters: number;
  channel: string | null;
}

export interface ProspectDiscoveryProvider {
  readonly id: "OSM" | "GOOGLE";
  // Never throws — network/HTTP failures become a warning + empty list.
  search(params: DiscoverySearchParams): Promise<{ places: DiscoveredPlace[]; warnings: string[] }>;
}

// Channel → abstract discovery category, per the approved decision: search
// ONLY the rep's own channel's categories (priority decisions come from
// FSOS engines, discovery is just the radar). The keyword map lives HERE,
// once — each provider translates the abstract category into its own
// vocabulary (Places includedTypes vs Overpass tag filters). Matched
// case-insensitively by substring, first hit wins; unknown/empty falls
// back to "traditional" (callers add the Arabic warning).
export type DiscoveryCategory = "traditional" | "horeca" | "modern" | "wholesale";

const CHANNEL_CATEGORIES: { keywords: string[]; category: DiscoveryCategory }[] = [
  { keywords: ["traditional", "tt", "تقليدي"], category: "traditional" },
  { keywords: ["horeca", "hotel", "restaurant"], category: "horeca" },
  { keywords: ["mt", "modern"], category: "modern" },
  { keywords: ["wholesale", "جملة"], category: "wholesale" },
];

export function categoryForChannel(repChannel: string | null): { category: DiscoveryCategory; matched: boolean } {
  const channel = (repChannel ?? "").trim().toLowerCase();
  if (channel !== "") {
    for (const entry of CHANNEL_CATEGORIES) {
      if (entry.keywords.some((k) => channel.includes(k))) return { category: entry.category, matched: true };
    }
  }
  return { category: "traditional", matched: false };
}
