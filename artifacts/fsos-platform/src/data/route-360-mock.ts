// ── Types ──────────────────────────────────────────────────────────────────
export type KPIStatus   = "on-track" | "at-risk" | "critical";
export type AlertSeverity = "Critical" | "High" | "Medium" | "Low";
export type StopStatus  = "Completed" | "In Progress" | "Planned" | "Skipped";
export type EngineStatus = "pending" | "connected" | "error";

export interface RouteInfo {
  id: string; name: string; rep: string; territory: string; date: string;
  plannedCustomers: number; activeCustomers: number;
  salesTotal: number; salesTarget: number;
  collectionDue: number; collectionReceived: number;
}

export interface RouteKPI {
  id: string; label: string; value: string; target: string;
  pct: number; status: KPIStatus;
}

export interface CustomerSegment {
  id: string; label: string; count: number; total: number;
  colorClass: string; description: string;
}

export interface ProductItem {
  sku: string; name: string; category: string;
  qty: number; value: number; note: string;
}

export interface ProductGroup {
  id: string; label: string;
  accentClass: string; iconName: string;
  items: ProductItem[];
}

export interface RouteAlert {
  id: string; severity: AlertSeverity;
  title: string; message: string;
  customer?: string; action: string;
}

export interface TimelineStop {
  order: number; customerName: string; location: string;
  plannedTime: string; status: StopStatus;
  actualTime?: string; objective: string;
}

export interface IntelligenceEngine {
  id: string; name: string; icon: string;
  description: string; contributes: string;
  status: EngineStatus;
}

// ── Route 360 Mock Data ────────────────────────────────────────────────────
export const ROUTE_INFO: RouteInfo = {
  id: "RT-D04",
  name: "Dubai South Circuit",
  rep: "James Al-Farsi",
  territory: "Dubai South · JBR · Jumeirah",
  date: "Monday, Jun 29, 2026",
  plannedCustomers: 8,
  activeCustomers: 6,
  salesTotal: 142500,
  salesTarget: 180000,
  collectionDue: 18000,
  collectionReceived: 12500,
};

export const ROUTE_KPIS: RouteKPI[] = [
  {
    id: "sales",
    label: "Sales vs Target",
    value: "AED 142,500",
    target: "AED 180,000",
    pct: 79,
    status: "at-risk",
  },
  {
    id: "coverage",
    label: "Coverage",
    value: "75%",
    target: "≥ 90%",
    pct: 75,
    status: "at-risk",
  },
  {
    id: "strike-rate",
    label: "Strike Rate",
    value: "83%",
    target: "≥ 85%",
    pct: 83,
    status: "at-risk",
  },
  {
    id: "aov",
    label: "Avg Order Value",
    value: "AED 28,500",
    target: "AED 22,500",
    pct: 127,
    status: "on-track",
  },
  {
    id: "collection",
    label: "Collection Progress",
    value: "AED 12,500",
    target: "AED 18,000",
    pct: 69,
    status: "critical",
  },
  {
    id: "active-rate",
    label: "Active Customer Rate",
    value: "75%",
    target: "≥ 80%",
    pct: 75,
    status: "at-risk",
  },
];

export const CUSTOMER_SEGMENTS: CustomerSegment[] = [
  {
    id: "active",
    label: "Active",
    count: 6, total: 8,
    colorClass: "emerald",
    description: "Placed an order in last 30 days",
  },
  {
    id: "inactive",
    label: "Inactive",
    count: 2, total: 8,
    colorClass: "rose",
    description: "No order in 30+ days",
  },
  {
    id: "high-value",
    label: "High Value",
    count: 3, total: 8,
    colorClass: "amber",
    description: "AOV > AED 30,000",
  },
  {
    id: "collection",
    label: "Collection Priority",
    count: 2, total: 8,
    colorClass: "orange",
    description: "Outstanding balance > 14 days",
  },
  {
    id: "lost-sales",
    label: "Lost Sales",
    count: 1, total: 8,
    colorClass: "violet",
    description: "OOS event in last 7 days",
  },
];

export const PRODUCT_GROUPS: ProductGroup[] = [
  {
    id: "top",
    label: "Top Selling Products",
    accentClass: "emerald",
    iconName: "TrendingUp",
    items: [
      { sku: "HPC-001", name: "Ariel Liquid 2L",         category: "Laundry",   qty: 84, value: 42000, note: "Consistent velocity +12% MoM" },
      { sku: "BEV-012", name: "Nescafé Classic 200g",    category: "Beverages", qty: 72, value: 28800, note: "Ordered by all 6 active accounts" },
      { sku: "HPC-004", name: "Head & Shoulders 400ml",  category: "Personal",  qty: 48, value: 19200, note: "High frequency restock across route" },
      { sku: "SNK-007", name: "Lay's Max 180g",          category: "Snacks",    qty: 60, value: 12000, note: "Summer promo +40% velocity" },
    ],
  },
  {
    id: "weak",
    label: "Weak Products",
    accentClass: "amber",
    iconName: "TrendingDown",
    items: [
      { sku: "GRM-005", name: "Gillette Fusion5 4ct",    category: "Grooming",  qty: 4,  value: 3200,  note: "Only 1 account ordering — listing gap" },
      { sku: "HPC-022", name: "Downy Fabric Softener 2L",category: "Laundry",   qty: 6,  value: 2700,  note: "Not listed at 4/6 active accounts" },
      { sku: "BEV-022", name: "Nescafé Gold 200g",       category: "Beverages", qty: 3,  value: 1800,  note: "Delisted at Carrefour MoE Apr 2026" },
    ],
  },
  {
    id: "lost",
    label: "Lost Sales",
    accentClass: "rose",
    iconName: "AlertOctagon",
    items: [
      { sku: "HPC-009", name: "Ariel 3-in-1 Pods 23ct", category: "Laundry",   qty: 0,  value: 0,     note: "OOS at Carrefour MoE — 3 days empty" },
      { sku: "HPC-011", name: "H&S Lemon Burst 400ml",  category: "Personal",  qty: 0,  value: 0,     note: "Not listed at LuLu Deira — competitor fill" },
    ],
  },
  {
    id: "cross-sell",
    label: "Cross Sell Opportunities",
    accentClass: "blue",
    iconName: "Zap",
    items: [
      { sku: "HPC-022", name: "Downy Fabric Softener 2L", category: "Laundry", qty: 0, value: 0,   note: "High affinity basket item — not in Spinneys" },
      { sku: "BEV-018", name: "Nescafé 3-in-1 30ct",      category: "Beverages",qty:0, value: 0,  note: "Spinneys JBR has adjacent accounts buying it" },
      { sku: "SNK-012", name: "Pringles Original 165g",   category: "Snacks",   qty:0, value: 0,  note: "Premium snack gap at Spinneys & Choithrams" },
    ],
  },
];

export const ROUTE_ALERTS: RouteAlert[] = [
  {
    id: "a1", severity: "Critical",
    title: "High Collection Risk",
    message: "Carrefour MoE has AED 8,500 outstanding — 21 days overdue. Credit limit approaching.",
    customer: "Carrefour – Mall of Emirates",
    action: "Collect today",
  },
  {
    id: "a2", severity: "High",
    title: "Low Coverage",
    message: "2 customers (Al Maya Karama, Waitrose Dubai Mall) have not been visited yet. Coverage at 75%.",
    action: "Prioritize remaining stops",
  },
  {
    id: "a3", severity: "High",
    title: "Lost Sales Alert",
    message: "Ariel 3-in-1 Pods OOS at Carrefour MoE for 3 days. Estimated lost revenue: AED 4,200.",
    customer: "Carrefour – Mall of Emirates",
    action: "Recover shelf space today",
  },
  {
    id: "a4", severity: "Medium",
    title: "Strike Rate Below Target",
    message: "Current strike rate 83% — below 85% KPI. One missed order from 6 visits.",
    action: "Review declined accounts",
  },
  {
    id: "a5", severity: "Medium",
    title: "Inactive Account Risk",
    message: "Al Maya Karama has not placed an order in 45 days. Account deactivation risk.",
    customer: "Al Maya Supermarket – Karama",
    action: "Engage and re-activate",
  },
  {
    id: "a6", severity: "Low",
    title: "Cross Sell Gap",
    message: "Head & Shoulders Lemon Burst not listed at Spinneys JBR. Competitor holds 2 facings.",
    customer: "Spinneys – JBR",
    action: "Propose listing today",
  },
];

export const ROUTE_TIMELINE: TimelineStop[] = [
  {
    order: 1, customerName: "Carrefour – Mall of Emirates", location: "Mall of Emirates, Dubai",
    plannedTime: "08:30", status: "Completed", actualTime: "08:25",
    objective: "Replenish Ariel Pods · Collect AED 8,500",
  },
  {
    order: 2, customerName: "LuLu Hypermarket – Deira", location: "Deira City Centre, Dubai",
    plannedTime: "10:00", status: "Completed", actualTime: "10:10",
    objective: "Standard restock · Propose H&S Lemon Burst listing",
  },
  {
    order: 3, customerName: "Spinneys – JBR", location: "The Walk, JBR, Dubai",
    plannedTime: "11:30", status: "In Progress",
    objective: "New listing proposal · Cross sell Downy & Nescafé 3-in-1",
  },
  {
    order: 4, customerName: "Union Coop – Al Quoz", location: "Al Quoz Industrial, Dubai",
    plannedTime: "13:00", status: "Planned",
    objective: "Restock Nescafé Classic · Downy new listing",
  },
  {
    order: 5, customerName: "Al Maya Supermarket – Karama", location: "Karama, Dubai",
    plannedTime: "14:30", status: "Planned",
    objective: "Re-activate account · Present current portfolio",
  },
  {
    order: 6, customerName: "Choithrams – Jumeirah", location: "Jumeirah, Dubai",
    plannedTime: "15:30", status: "Planned",
    objective: "Standard restock · Propose Pringles listing",
  },
  {
    order: 7, customerName: "Waitrose – Dubai Mall", location: "Dubai Mall, Downtown",
    plannedTime: "16:30", status: "Planned",
    objective: "Premium range restock · Collect overdue balance",
  },
  {
    order: 8, customerName: "Géant – Festival City", location: "Festival City, Dubai",
    plannedTime: "17:30", status: "Planned",
    objective: "End-of-day restock top sellers",
  },
];

export const INTELLIGENCE_ENGINES: IntelligenceEngine[] = [
  {
    id: "geo",
    name: "Geo Intelligence Engine", icon: "Satellite",
    description: "Analyzes territory-level demand signals, competitor activity, and zone-based benchmarks.",
    contributes: "Area velocity benchmarks & competitor gap alerts",
    status: "pending",
  },
  {
    id: "loading",
    name: "Loading Intelligence Engine", icon: "Truck",
    description: "Recommends vehicle loading based on customer demand, visit plan, and product priorities.",
    contributes: "Optimal load plan per route per day",
    status: "pending",
  },
  {
    id: "lost-sales",
    name: "Lost Sales Engine", icon: "TrendingDown",
    description: "Detects OOS events, competitor fills, and delisted SKUs across route customers.",
    contributes: "Lost sales recovery alerts & shelf gap flags",
    status: "pending",
  },
  {
    id: "cross-sell",
    name: "Cross Sell Intelligence", icon: "Zap",
    description: "Identifies high-affinity products not currently in each customer's purchase mix.",
    contributes: "New listing recommendations per account",
    status: "pending",
  },
  {
    id: "collection",
    name: "Collection Intelligence", icon: "CreditCard",
    description: "Scores collection risk per account and surfaces optimal collection sequences.",
    contributes: "Collection priority ranking & risk scores",
    status: "pending",
  },
  {
    id: "coaching",
    name: "Behavioral Coaching", icon: "Brain",
    description: "Analyzes rep visit patterns and outcomes to surface performance coaching insights.",
    contributes: "Rep performance coaching signals",
    status: "pending",
  },
  {
    id: "dna",
    name: "Company DNA", icon: "Building2",
    description: "Applies brand, category strategy, and commercial guidelines to all route decisions.",
    contributes: "Brand & category compliance layer",
    status: "pending",
  },
];
