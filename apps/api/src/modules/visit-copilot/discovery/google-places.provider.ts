import {
  categoryForChannel,
  type DiscoveredPlace,
  type DiscoveryCategory,
  type DiscoverySearchParams,
  type ProspectDiscoveryProvider,
} from "./discovery-provider.interface";
import { businessTypeFromGooglePrimaryType } from "../../prospects/prospect-taxonomy";

// Google Places Nearby Search (New) provider — the original Phase 2
// implementation moved out of visit-copilot.service.ts unchanged, with one
// deliberate difference: the API key is now the COMPANY's own key (stored
// encrypted on CompanyProfile, decrypted by the caller and passed in), not
// a platform-wide env var — each company carries its own Google billing.
const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/";
const GOOGLE_PLACES_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.primaryType,places.rating,places.userRatingCount,places.regularOpeningHours,places.photos";
const GOOGLE_MAX_RESULT_COUNT = 20;
const GOOGLE_INTELLIGENCE_FIELD_MASK = "primaryType,types,priceLevel,priceRange,rating,userRatingCount,regularOpeningHours,servesBreakfast,servesLunch,servesDinner,servesBrunch,servesCoffee,servesDessert,servesVegetarianFood,delivery,dineIn,takeout";

// Search Text carries the selling-channel intent directly to Google instead
// of asking the same generic nearby query for every rep channel.
const CATEGORY_SEARCH_TEXT: Record<DiscoveryCategory, string> = {
  traditional: "متاجر البقالة grocery stores mini markets تموينات",
  modern: "supermarkets hypermarkets",
  horeca: "restaurants cafes hotels",
  wholesale: "food wholesalers FMCG wholesalers",
};

const CATEGORY_ACCEPTED_TYPES: Record<DiscoveryCategory, readonly string[]> = {
  traditional: ["grocery_store", "asian_grocery_store", "convenience_store", "supermarket", "food_store"],
  horeca: ["restaurant", "cafe", "coffee_shop", "bakery", "hotel", "catering_service"],
  modern: ["supermarket", "hypermarket", "department_store", "shopping_mall"],
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
    rating?: number;
    userRatingCount?: number;
    regularOpeningHours?: OpeningHours;
    photos?: { name?: string; authorAttributions?: { displayName?: string }[] }[];
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
          textQuery: CATEGORY_SEARCH_TEXT[category],
          maxResultCount: GOOGLE_MAX_RESULT_COUNT,
          locationBias: { circle: { center: { latitude: params.lat, longitude: params.lon }, radius: params.radiusMeters } },
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
      if (typeof pl.id !== "string" || pl.id === "" || typeof lat !== "number" || typeof lon !== "number" || !CATEGORY_ACCEPTED_TYPES[category].includes(pl.primaryType ?? "")) continue;
      places.push({
        externalKey: pl.id,
        name: pl.displayName?.text?.trim() || pl.primaryType || "غير معروف",
        lat,
        lon,
        address: pl.formattedAddress ?? null,
        phone: pl.nationalPhoneNumber ?? null,
        businessType: businessTypeFromGooglePrimaryType(pl.primaryType),
        sizeBand: null,
        activity: { rating: typeof pl.rating === "number" ? pl.rating : null, userRatingCount: typeof pl.userRatingCount === "number" ? pl.userRatingCount : null, weeklyOpenHours: weeklyOpenHours(pl.regularOpeningHours) },
        photo: pl.photos?.[0]?.name ? { resourceName: pl.photos[0].name, attribution: pl.photos[0].authorAttributions?.map((author) => author.displayName).filter(Boolean).join(", ") || null } : null,
      });
    }
    return { places, warnings: [] };
  }

  async photoUrl(resourceName: string): Promise<string | null> {
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(resourceName)) return null;
    try {
      const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}${resourceName}/media?maxHeightPx=160&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": this.apiKey } });
      if (!response.ok) return null;
      const body = await response.json() as { photoUri?: string };
      return typeof body.photoUri === "string" ? body.photoUri : null;
    } catch { return null; }
  }

  // Deliberately separate from search: callers invoke this only for one
  // Prospect whose cached intelligence is absent or stale.
  async intelligenceFacts(placeId: string): Promise<GooglePlaceIntelligenceFacts | null> {
    if (this.apiKey.trim() === "" || placeId.trim() === "") return null;
    let response: globalThis.Response;
    try {
      response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": GOOGLE_INTELLIGENCE_FIELD_MASK } });
    } catch { return null; }
    if (!response.ok) return null;
    let place: GooglePlaceDetailsResponse;
    try { place = await response.json() as GooglePlaceDetailsResponse; } catch { return null; }
    // Raw response dies here. Only normalized, request-scoped facts leave.
    return {
      businessType: businessTypeFromGooglePrimaryType(place.primaryType),
      hasHours: (place.regularOpeningHours?.weekdayDescriptions?.length ?? 0) > 0,
      weeklyOpenHours: weeklyOpenHours(place.regularOpeningHours),
      priceLevel: place.priceLevel ?? null,
      rating: typeof place.rating === "number" ? place.rating : null,
      userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
      hasPriceRange: place.priceRange !== undefined,
      services: {
        breakfast: place.servesBreakfast === true, lunch: place.servesLunch === true, dinner: place.servesDinner === true,
        brunch: place.servesBrunch === true, coffee: place.servesCoffee === true, dessert: place.servesDessert === true,
        vegetarian: place.servesVegetarianFood === true, delivery: place.delivery === true, dineIn: place.dineIn === true, takeout: place.takeout === true,
      },
    };
  }
}

export type GooglePlaceIntelligenceFacts = { businessType: string | null; hasHours: boolean; weeklyOpenHours: number | null; priceLevel: string | null; rating: number | null; userRatingCount: number | null; hasPriceRange: boolean; services: Record<"breakfast" | "lunch" | "dinner" | "brunch" | "coffee" | "dessert" | "vegetarian" | "delivery" | "dineIn" | "takeout", boolean> };
type OpeningHours = { weekdayDescriptions?: string[]; periods?: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] };
type GooglePlaceDetailsResponse = { primaryType?: string; types?: string[]; priceLevel?: string; priceRange?: unknown; rating?: number; userRatingCount?: number; regularOpeningHours?: OpeningHours; servesBreakfast?: boolean; servesLunch?: boolean; servesDinner?: boolean; servesBrunch?: boolean; servesCoffee?: boolean; servesDessert?: boolean; servesVegetarianFood?: boolean; delivery?: boolean; dineIn?: boolean; takeout?: boolean };

function weeklyOpenHours(hours: OpeningHours | undefined): number | null {
  const periods = hours?.periods;
  if (!periods || periods.length === 0) return null;
  const weekMinutes = 7 * 24 * 60;
  let total = 0;
  for (const period of periods) {
    const open = period.open; const close = period.close;
    if (open?.day === undefined || open.hour === undefined || close?.day === undefined || close.hour === undefined) continue;
    const from = open.day * 1440 + open.hour * 60 + (open.minute ?? 0);
    const to = close.day * 1440 + close.hour * 60 + (close.minute ?? 0);
    total += ((to - from + weekMinutes) % weekMinutes) || 24 * 60;
  }
  return total === 0 ? null : Math.round(total / 60 * 100) / 100;
}
