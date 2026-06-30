// ── Types ──────────────────────────────────────────────────────────────────
export type LoadPriority = "Critical" | "High" | "Medium" | "Low";
export type EngineStatus = "pending" | "connected" | "error";

export interface MissionSnapshot {
  date: string;
  plannedVisits: number;
  plannedCustomers: string[];
  salesTarget: number;
  collectionTarget: number;
}

export interface VehicleLoad {
  sku: string; name: string; qty: number; unit: string;
}

export interface VehicleStatus {
  id: string; plate: string; type: string;
  capacityKg: number; capacityM3: number;
  currentLoadKg: number; currentLoadM3: number;
  currentItems: VehicleLoad[];
}

export interface RecommendedItem {
  sku: string; name: string; category: string;
  currentVanQty: number; recommendedQty: number; unit: string;
  priority: LoadPriority;
  reason: string;                 // placeholder text — engine will generate this
  engineSources: string[];        // engines that will contribute this recommendation
}

export interface ProductFocusItem {
  sku: string; name: string; category: string;
  priority: LoadPriority;
  context: string;
}

export interface IntelligenceEngine {
  id: string; name: string; icon: string;
  description: string;
  contributes: string;
  status: EngineStatus;
}

// ── Mock data ──────────────────────────────────────────────────────────────
export const MISSION_SNAPSHOT: MissionSnapshot = {
  date: "Monday, Jun 29, 2026",
  plannedVisits: 6,
  plannedCustomers: [
    "Carrefour – Mall of Emirates",
    "LuLu Hypermarket – Deira",
    "Spinneys – JBR",
    "Union Coop – Al Quoz",
    "Al Maya Supermarket – Karama",
    "Choithrams – Jumeirah",
  ],
  salesTarget: 45000,
  collectionTarget: 18000,
};

export const VEHICLE_STATUS: VehicleStatus = {
  id: "VAN-D04-001",
  plate: "Dubai A 12345",
  type: "Medium Cargo Van",
  capacityKg: 1500,
  capacityM3: 12,
  currentLoadKg: 0,
  currentLoadM3: 0,
  currentItems: [], // empty at start of day
};

export const RECOMMENDED_ITEMS: RecommendedItem[] = [
  {
    sku: "HPC-009", name: "Ariel 3-in-1 Pods 23ct", category: "Laundry",
    currentVanQty: 0, recommendedQty: 5, unit: "cases",
    priority: "Critical",
    reason: "OOS recovery at Carrefour MoE — shelf empty for 3 days. Urgent.",
    engineSources: ["Lost Sales Engine", "Daily Mission"],
  },
  {
    sku: "HPC-001", name: "Ariel Liquid 2L", category: "Laundry",
    currentVanQty: 0, recommendedQty: 42, unit: "cases",
    priority: "Critical",
    reason: "Top-selling SKU across 4 customers. Velocity +12%. Volume increase recommended.",
    engineSources: ["Sales History", "Daily Mission"],
  },
  {
    sku: "HPC-022", name: "Downy Fabric Softener 2L", category: "Laundry",
    currentVanQty: 0, recommendedQty: 10, unit: "cases",
    priority: "High",
    reason: "New listing proposal at Spinneys JBR + Union Coop. Basket affinity 87%.",
    engineSources: ["Cross Sell Intelligence", "Geo Intelligence"],
  },
  {
    sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages",
    currentVanQty: 0, recommendedQty: 36, unit: "cases",
    priority: "High",
    reason: "Regular restocking across 3 accounts. Bi-weekly cycle due today.",
    engineSources: ["Sales History"],
  },
  {
    sku: "HPC-004", name: "Head & Shoulders 400ml", category: "Personal Care",
    currentVanQty: 0, recommendedQty: 16, unit: "cases",
    priority: "High",
    reason: "Restocking cycle due at 2 accounts. Last ordered Jun 18.",
    engineSources: ["Sales History", "Daily Mission"],
  },
  {
    sku: "HPC-011", name: "H&S Lemon Burst 400ml", category: "Personal Care",
    currentVanQty: 0, recommendedQty: 6, unit: "cases",
    priority: "High",
    reason: "Not listed at LuLu Deira. Competitor holds 2 facings. Recovery opportunity.",
    engineSources: ["Lost Sales Engine", "Geo Intelligence"],
  },
  {
    sku: "SNK-007", name: "Lay's Max 180g", category: "Snacks",
    currentVanQty: 0, recommendedQty: 24, unit: "cases",
    priority: "Medium",
    reason: "Summer promo momentum. +40% velocity in June. Promo ends Jul 15.",
    engineSources: ["Seasonal Intelligence", "Sales History"],
  },
  {
    sku: "BEV-018", name: "Nescafé 3-in-1 30ct", category: "Beverages",
    currentVanQty: 0, recommendedQty: 6, unit: "cases",
    priority: "Medium",
    reason: "Cross-sell opportunity at Spinneys JBR. 4 nearby stores carry this SKU.",
    engineSources: ["Cross Sell Intelligence", "Geo Intelligence"],
  },
  {
    sku: "BEV-022", name: "Nescafé Gold 200g", category: "Beverages",
    currentVanQty: 0, recommendedQty: 6, unit: "cases",
    priority: "Medium",
    reason: "Re-listing trial at Carrefour MoE. Delisted Apr 2026 — recovery window open.",
    engineSources: ["Lost Sales Engine", "Seasonal Intelligence"],
  },
  {
    sku: "SNK-012", name: "Pringles Original 165g", category: "Snacks",
    currentVanQty: 0, recommendedQty: 4, unit: "cases",
    priority: "Low",
    reason: "New listing pilot at Spinneys JBR. Completes premium snacks shelf set.",
    engineSources: ["Cross Sell Intelligence"],
  },
  {
    sku: "GRM-005", name: "Gillette Fusion5 4ct", category: "Grooming",
    currentVanQty: 0, recommendedQty: 4, unit: "cases",
    priority: "Low",
    reason: "Premium grooming gap at Carrefour MoE. 6 hypermarkets in territory carry it.",
    engineSources: ["Company DNA", "Geo Intelligence"],
  },
];

export const PRODUCT_FOCUS: ProductFocusItem[] = [
  {
    sku: "HPC-009", name: "Ariel 3-in-1 Pods 23ct", category: "Laundry",
    priority: "Critical",
    context: "Carrefour MoE shelf has been empty for 3 days. This is the #1 loading priority today.",
  },
  {
    sku: "HPC-022", name: "Downy Fabric Softener 2L", category: "Laundry",
    priority: "High",
    context: "New listing proposals at Spinneys JBR and Union Coop today. Bring samples for buyer.",
  },
  {
    sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages",
    priority: "High",
    context: "Highest volume SKU across 3 stops today. Ensure sufficient stock for all accounts.",
  },
];

export const INTELLIGENCE_ENGINES: IntelligenceEngine[] = [
  {
    id: "sales-history",
    name: "Sales History", icon: "BarChart2",
    description: "Analyzes 90-day purchase patterns per customer to determine restocking quantities and order cycles.",
    contributes: "Recommended quantities & restock timing",
    status: "pending",
  },
  {
    id: "lost-sales",
    name: "Lost Sales Engine", icon: "TrendingDown",
    description: "Identifies OOS events, competitor fills, and delisted SKUs to flag urgent shelf recovery priorities.",
    contributes: "Critical & urgent loading priorities",
    status: "pending",
  },
  {
    id: "cross-sell",
    name: "Cross Sell Intelligence", icon: "Zap",
    description: "Surfaces products with high basket affinity not currently in each customer's purchase mix.",
    contributes: "New SKU introduction recommendations",
    status: "pending",
  },
  {
    id: "company-dna",
    name: "Company DNA", icon: "Building2",
    description: "Applies brand guidelines, category strategy, range priorities, and company rules to loading decisions.",
    contributes: "Brand & category compliance filters",
    status: "pending",
  },
  {
    id: "geo-intelligence",
    name: "Geo Intelligence", icon: "Satellite",
    description: "Factors in area-level velocity benchmarks, zone demand signals, and competitor activity maps.",
    contributes: "Zone-specific product mix adjustments",
    status: "pending",
  },
  {
    id: "daily-mission",
    name: "Daily Mission", icon: "Crosshair",
    description: "Reads today's visit plan, customer priorities, and mission objectives to align loading with the day's goals.",
    contributes: "Visit-specific quantity and objective alignment",
    status: "pending",
  },
  {
    id: "seasonal",
    name: "Seasonal Intelligence", icon: "Calendar",
    description: "Applies seasonal demand patterns, promotional calendar signals, and upcoming campaign requirements.",
    contributes: "Seasonal quantity uplift recommendations",
    status: "pending",
  },
];
