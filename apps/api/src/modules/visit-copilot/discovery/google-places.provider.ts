import {
  categoryForChannel,
  type DiscoveredPlace,
  type DiscoveryCategory,
  type DiscoverySearchParams,
  type ProspectDiscoveryProvider,
} from "./discovery-provider.interface";

// Google Places Nearby Search (New) provider — the original Phase 2
// implementation moved out of visit-copilot.service.ts unchanged, with one
// deliberate difference: the API key is now the COMPANY's own key (stored
// encrypted on CompanyProfile, decrypted by the caller and passed in), not
// a platform-wide env var — each company carries its own Google billing.
const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const GOOGLE_PLACES_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.primaryType";
const GOOGLE_MAX_RESULT_COUNT = 20;

// Abstract category → Places API (New) includedTypes (same lists as the
// original CHANNEL_PLACE_TYPES map).
const CATEGORY_INCLUDED_TYPES: Record<DiscoveryCategory, string[]> = {
  traditional: ["grocery_store", "convenience_store", "supermarket", "food_store"],
  horeca: ["restaurant", "cafe", "coffee_shop", "bakery", "hotel", "catering_service"],
  modern: ["supermarket", "department_store", "shopping_mall"],
  wholesale: ["wholesaler", "warehouse_store"],
};

type PlacesSearchResponse = {
  places?: {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    nationalPhoneNumber?: string;
    primaryType?: string;
  }[];
};

export class GooglePlacesProvider implements ProspectDiscoveryProvider {
  readonly id = "GOOGLE" as const;

  constructor(private readonly apiKey: string) {}

  async search(params: DiscoverySearchParams): Promise<{ places: DiscoveredPlace[]; warnings: string[] }> {
    // Defensive — the service already short-circuits to disabled:true when
    // no key is stored, so this only fires on a decrypt-to-empty edge case.
    if (this.apiKey.trim() === "") {
      return { places: [], warnings: ["مفتاح Google Places مش متسجل للشركة"] };
    }

    const { category } = categoryForChannel(params.channel);
    let response: globalThis.Response;
    try {
      response = await fetch(GOOGLE_PLACES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
        },
        body: JSON.stringify({
          includedTypes: CATEGORY_INCLUDED_TYPES[category],
          maxResultCount: GOOGLE_MAX_RESULT_COUNT,
          locationRestriction: { circle: { center: { latitude: params.lat, longitude: params.lon }, radius: params.radiusMeters } },
        }),
      });
    } catch {
      return { places: [], warnings: ["تعذر الاتصال بـ Google Places — حاول تاني."] };
    }
    if (!response.ok) {
      return { places: [], warnings: [`فشل طلب Google Places (${response.status}) — حاول تاني أو راجع مفتاح الـ API.`] };
    }

    let data: PlacesSearchResponse;
    try {
      data = (await response.json()) as PlacesSearchResponse;
    } catch {
      return { places: [], warnings: ["رد غير مفهوم من Google Places — حاول تاني."] };
    }

    const places: DiscoveredPlace[] = [];
    for (const pl of data.places ?? []) {
      const lat = pl.location?.latitude;
      const lon = pl.location?.longitude;
      if (typeof pl.id !== "string" || pl.id === "" || typeof lat !== "number" || typeof lon !== "number") continue;
      places.push({
        externalKey: pl.id,
        name: pl.displayName?.text?.trim() || pl.primaryType || "غير معروف",
        lat,
        lon,
        address: pl.formattedAddress ?? null,
        phone: pl.nationalPhoneNumber ?? null,
      });
    }
    return { places, warnings: [] };
  }
}
