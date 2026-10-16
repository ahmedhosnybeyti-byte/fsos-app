type GeoKind = "region" | "city";

type GeoDefinition = { key: string; labelAr: string; aliases: readonly string[] };

const REGIONS: readonly GeoDefinition[] = [
  { key: "riyadh-region", labelAr: "منطقة الرياض", aliases: ["الرياض", "منطقة الرياض", "riyadh", "riyadh region"] },
  { key: "makkah-region", labelAr: "منطقة مكة المكرمة", aliases: ["مكة المكرمة", "منطقة مكة المكرمة", "makkah", "makkah region", "mecca region"] },
  { key: "madinah-region", labelAr: "منطقة المدينة المنورة", aliases: ["المدينة المنورة", "منطقة المدينة المنورة", "madinah", "madinah region", "medina region"] },
  { key: "eastern-province", labelAr: "المنطقة الشرقية", aliases: ["المنطقة الشرقية", "الشرقية", "eastern province", "eastern region", "ash sharqiyah"] },
  { key: "qassim-region", labelAr: "منطقة القصيم", aliases: ["القصيم", "منطقة القصيم", "qassim", "al qassim", "qassim region"] },
  { key: "asir-region", labelAr: "منطقة عسير", aliases: ["عسير", "منطقة عسير", "asir", "aseer", "asir region"] },
  { key: "tabuk-region", labelAr: "منطقة تبوك", aliases: ["تبوك", "منطقة تبوك", "tabuk", "tabuk region"] },
  { key: "hail-region", labelAr: "منطقة حائل", aliases: ["حائل", "منطقة حائل", "hail", "ha'il", "hail region"] },
  { key: "northern-borders", labelAr: "منطقة الحدود الشمالية", aliases: ["الحدود الشمالية", "منطقة الحدود الشمالية", "northern borders", "northern border region"] },
  { key: "jazan-region", labelAr: "منطقة جازان", aliases: ["جازان", "منطقة جازان", "jazan", "jizan", "jazan region"] },
  { key: "najran-region", labelAr: "منطقة نجران", aliases: ["نجران", "منطقة نجران", "najran", "najran region"] },
  { key: "baha-region", labelAr: "منطقة الباحة", aliases: ["الباحة", "منطقة الباحة", "al baha", "baha", "al-baha region"] },
  { key: "jawf-region", labelAr: "منطقة الجوف", aliases: ["الجوف", "منطقة الجوف", "al jawf", "jawf", "al-jawf region"] },
];

const CITIES: readonly GeoDefinition[] = [
  { key: "riyadh", labelAr: "الرياض", aliases: ["الرياض", "riyadh"] },
  { key: "jeddah", labelAr: "جدة", aliases: ["جدة", "jeddah", "jidda", "jiddah"] },
  { key: "makkah", labelAr: "مكة المكرمة", aliases: ["مكة", "مكة المكرمة", "makkah", "mecca"] },
  { key: "madinah", labelAr: "المدينة المنورة", aliases: ["المدينة", "المدينة المنورة", "madinah", "medina"] },
  { key: "dammam", labelAr: "الدمام", aliases: ["الدمام", "dammam"] },
  { key: "khobar", labelAr: "الخبر", aliases: ["الخبر", "khobar", "al khobar", "al-khobar"] },
  { key: "dhahran", labelAr: "الظهران", aliases: ["الظهران", "dhahran"] },
  { key: "taif", labelAr: "الطائف", aliases: ["الطائف", "taif", "at taif"] },
  { key: "buraydah", labelAr: "بريدة", aliases: ["بريدة", "buraydah", "buraidah"] },
  { key: "abha", labelAr: "أبها", aliases: ["أبها", "ابها", "abha"] },
  { key: "tabuk", labelAr: "تبوك", aliases: ["تبوك", "tabuk"] },
  { key: "hail", labelAr: "حائل", aliases: ["حائل", "hail", "ha'il"] },
  { key: "jazan", labelAr: "جازان", aliases: ["جازان", "jazan", "jizan"] },
  { key: "najran", labelAr: "نجران", aliases: ["نجران", "najran"] },
  { key: "jubail", labelAr: "الجبيل", aliases: ["الجبيل", "jubail", "al jubail"] },
  { key: "yanbu", labelAr: "ينبع", aliases: ["ينبع", "yanbu", "yanbu al bahr"] },
];

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en").normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[._,،'’`-]+/g, " ")
    .replace(/\s+/g, " ");
}

function definitions(kind: GeoKind): readonly GeoDefinition[] {
  return kind === "region" ? REGIONS : CITIES;
}

export function geoKey(kind: GeoKind, value: string): string {
  const target = normalized(value);
  return definitions(kind).find((item) => item.aliases.some((alias) => normalized(alias) === target))?.key ?? `raw:${encodeURIComponent(value.trim())}`;
}

export function geoAliases(kind: GeoKind, key: string): string[] {
  const known = definitions(kind).find((item) => item.key === key);
  if (known) return [...known.aliases];
  if (key.startsWith("raw:")) {
    try { return [decodeURIComponent(key.slice(4))]; } catch { return []; }
  }
  return [];
}

export function geoLabel(kind: GeoKind, key: string, observed: string[]): string {
  return definitions(kind).find((item) => item.key === key)?.labelAr ?? observed[0] ?? key;
}

export type OpportunityGeoOption = { key: string; label: string };

export function groupGeoOptions(kind: GeoKind, values: Array<string | null | undefined>): OpportunityGeoOption[] {
  const grouped = new Map<string, string[]>();
  for (const value of values) {
    if (!value?.trim()) continue;
    const key = geoKey(kind, value);
    grouped.set(key, [...(grouped.get(key) ?? []), value.trim()]);
  }
  return [...grouped.entries()]
    .map(([key, observed]) => ({ key, label: geoLabel(kind, key, observed) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}
