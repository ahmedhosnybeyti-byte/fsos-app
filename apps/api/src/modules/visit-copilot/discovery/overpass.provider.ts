import {
  categoryForChannel,
  type DiscoveredPlace,
  type DiscoveryCategory,
  type DiscoverySearchParams,
  type ProspectDiscoveryProvider,
} from "./discovery-provider.interface";

// Default discovery provider: OpenStreetMap via the public Overpass API —
// free, no key, no signup, so every company gets "search around me" out of
// the box. Trade-off vs Google: coverage depends on local OSM mapping and
// there are no place photos/ratings, but the FSOS pipeline only needs
// name + coordinates (+ optional address/phone), which OSM tags carry.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT_MS = 15_000;
// Mirrors Google's 20-cap order of magnitude; Overpass `out N` caps the
// element count server-side so a dense city block can't flood the response.
const OVERPASS_MAX_RESULTS = 40;

// Abstract category → Overpass tag filters. Each entry becomes its own
// union clause (`nwr(around:...)[filter];`) — Overpass has no OR inside a
// single tag filter across different keys, so horeca needs three clauses.
const CATEGORY_TAG_FILTERS: Record<DiscoveryCategory, string[]> = {
  traditional: ['[shop~"^(convenience|supermarket|greengrocer|general|kiosk|grocery)$"]'],
  horeca: ['[amenity~"^(restaurant|cafe|fast_food|bar|ice_cream)$"]', '[shop~"^(bakery|pastry)$"]', '[tourism="hotel"]'],
  modern: ['[shop~"^(supermarket|department_store|mall)$"]'],
  wholesale: ['[shop~"^(wholesale|trade)$"]'],
};

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  // ways/relations carry their centroid here (`out center`)
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements?: OverpassElement[] };

export class OverpassProvider implements ProspectDiscoveryProvider {
  readonly id = "OSM" as const;

  async search(params: DiscoverySearchParams): Promise<{ places: DiscoveredPlace[]; warnings: string[] }> {
    const { category } = categoryForChannel(params.channel);
    const around = `around:${Math.round(params.radiusMeters)},${params.lat},${params.lon}`;
    const unionClauses = CATEGORY_TAG_FILTERS[category].map((filter) => `nwr(${around})${filter};`).join("");
    const query = `[out:json][timeout:15];(${unionClauses});out center ${OVERPASS_MAX_RESULTS};`;

    // Overpass is a shared free service — degrade to warning + empty on any
    // failure (never throw), and abort hard at 15s so the rep's screen
    // never hangs on a busy mirror.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    let response: globalThis.Response;
    try {
      response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
    } catch {
      return { places: [], warnings: ["تعذر الاتصال بخرائط OpenStreetMap — حاول تاني بعد قليل."] };
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      return { places: [], warnings: [`فشل طلب OpenStreetMap (${response.status}) — حاول تاني بعد قليل.`] };
    }

    let data: OverpassResponse;
    try {
      data = (await response.json()) as OverpassResponse;
    } catch {
      return { places: [], warnings: ["رد غير مفهوم من OpenStreetMap — حاول تاني بعد قليل."] };
    }

    const places: DiscoveredPlace[] = [];
    for (const el of data.elements ?? []) {
      const tags = el.tags ?? {};
      // A nameless POI is useless to a rep knocking on doors — skip it.
      const name = (tags.name ?? "").trim();
      if (name === "" || typeof el.id !== "number" || typeof el.type !== "string" || el.type === "") continue;
      const lat = typeof el.lat === "number" ? el.lat : el.center?.lat;
      const lon = typeof el.lon === "number" ? el.lon : el.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") continue;
      const street = (tags["addr:street"] ?? "").trim();
      const city = (tags["addr:city"] ?? "").trim();
      const address = [street, city].filter((part) => part !== "").join("، ") || null;
      places.push({
        externalKey: `osm-${el.type}-${el.id}`,
        name,
        lat,
        lon,
        address,
        phone: tags.phone ?? tags["contact:phone"] ?? null,
      });
    }
    return { places, warnings: [] };
  }
}
