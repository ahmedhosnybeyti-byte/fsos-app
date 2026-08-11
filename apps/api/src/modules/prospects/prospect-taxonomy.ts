export type ProspectMarketSegment = "RETAIL_FMCG" | "HORECA";
export type DiscoveryCategory = "traditional" | "horeca" | "modern" | "wholesale";

type ChannelRule = { aliases: readonly string[]; segment: ProspectMarketSegment; category: DiscoveryCategory };

const CHANNEL_RULES: readonly ChannelRule[] = [
  { aliases: ["horeca", "hotel", "hotels", "restaurant", "restaurants", "cafe", "cafes"], segment: "HORECA", category: "horeca" },
  { aliases: ["modern trade", "modern", "mt", "hypermarket", "supermarket"], segment: "RETAIL_FMCG", category: "modern" },
  { aliases: ["wholesale", "distributor", "distributors"], segment: "RETAIL_FMCG", category: "wholesale" },
  { aliases: ["cash van", "cashvan", "traditional trade", "traditional", "tt", "retail", "fmcg", "grocery", "convenience"], segment: "RETAIL_FMCG", category: "traditional" },
];

function normalizeChannel(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/[\s_\-/]+/g, " ");
}

export function taxonomyForCanonicalChannel(channel: string | null): { segment: ProspectMarketSegment; category: DiscoveryCategory; matched: boolean } | null {
  const normalized = normalizeChannel(channel);
  const rule = CHANNEL_RULES.find((candidate) => candidate.aliases.some((alias) => normalized === alias || ` ${normalized} `.includes(` ${alias} `)));
  return rule ? { segment: rule.segment, category: rule.category, matched: true } : null;
}

export function businessTypeFromGooglePrimaryType(primaryType: string | undefined): string | null {
  const type = (primaryType ?? "").trim();
  const allowed = new Set(["hypermarket", "supermarket", "grocery_store", "convenience_store", "food_store", "wholesaler", "warehouse_store", "hotel", "restaurant", "cafe", "coffee_shop", "bakery", "catering_service"]);
  return allowed.has(type) ? type : null;
}
