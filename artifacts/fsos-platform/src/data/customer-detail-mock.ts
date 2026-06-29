// ── Core types ────────────────────────────────────────────────────────────────
export type Classification = "A" | "B" | "C";
export type Priority       = "Critical" | "High" | "Medium" | "Low";
export type RiskLevel      = "Critical" | "High" | "Medium" | "Low";
export type VisitStatus    = "Completed" | "Missed" | "Cancelled";
export type VisitType      = "Order" | "Collection" | "Promotional" | "Survey" | "Standard";
export type RecoType       = "increase" | "recover" | "offer" | "collect";
export type LostReason     = "OOS" | "Not Listed" | "Delisted" | "Competitor";

export interface TopProduct {
  rank: number; sku: string; name: string; category: string;
  unitsSold: number; unit: string; revenue: number; trend: number;
}

export interface LostProduct {
  sku: string; name: string; category: string; reason: LostReason;
  detail: string; estLoss: number; daysMissing?: number;
}

export interface CrossSellProduct {
  sku: string; name: string; category: string;
  affinity: number; detail: string; opportunity: number;
}

export interface AIRecommendation {
  id: string; type: RecoType; priority: Priority;
  title: string; subtitle: string; detail: string;
  impact: string; actionLabel: string;
}

export interface VisitRecord {
  id: number; date: string; time: string;
  status: VisitStatus; type: VisitType;
  outcome: string; orderValue?: number; note?: string;
  rep: string; duration?: string;
}

export interface CustomerDetailData {
  // Identity
  id: number; name: string; code: string;
  classification: Classification; type: string;
  territory: string; route: string; region: string; address: string;
  distance: string; riskLevel: RiskLevel; status: "Active" | "At Risk" | "Inactive";

  // Contacts
  buyerName: string; buyerPhone: string;

  // Financials
  creditLimit: number; outstandingBalance: number;
  lastInvoice: { date: string; amount: number; ref: string };
  lastPayment: { date: string; amount: number };
  collectionPct: number;

  // Performance
  mtdRevenue: number; targetMtd: number;
  salesLastMonth: number; ordersCount: number; avgOrder: number;

  // Visit
  lastVisit: string;

  // Intelligence
  topProducts: TopProduct[];
  lostProducts: LostProduct[];
  crossSell: CrossSellProduct[];
  aiRecommendations: AIRecommendation[];
  visits: VisitRecord[];

  // Legacy copilot (kept for AI panel compatibility)
  copilotQa: { question: string; answer: string; tags: string[] }[];
}

// ── Mock data ─────────────────────────────────────────────────────────────────
export const CUSTOMER_DETAIL_MAP: Record<number, CustomerDetailData> = {
  1: {
    id: 1,
    name: "Carrefour – Mall of Emirates",
    code: "CAR-MOE-001",
    classification: "A",
    type: "Hypermarket",
    territory: "Dubai South",
    route: "Route D-04 · Sheikh Zayed Corridor",
    region: "Sheikh Zayed Rd, Dubai",
    address: "Level G, Mall of Emirates, Sheikh Zayed Rd, Dubai",
    distance: "2.4 km",
    riskLevel: "Low",
    status: "Active",
    buyerName: "Ahmad Al-Rashid",
    buyerPhone: "+971 50 774 2211",

    creditLimit: 75000,
    outstandingBalance: 12400,
    lastInvoice: { date: "Jun 25, 2026", amount: 28400, ref: "INV-2026-0892" },
    lastPayment: { date: "Jun 22, 2026", amount: 15000 },
    collectionPct: 92,

    mtdRevenue: 145200,
    targetMtd: 150000,
    salesLastMonth: 133000,
    ordersCount: 12,
    avgOrder: 12100,
    lastVisit: "Today, 08:30 AM",

    topProducts: [
      { rank: 1, sku: "HPC-001", name: "Ariel Liquid 2L",           category: "Laundry",       unitsSold: 216, unit: "cases", revenue: 54000, trend: 12  },
      { rank: 2, sku: "BEV-012", name: "Nescafé Classic 200g",       category: "Beverages",     unitsSold: 144, unit: "cases", revenue: 28800, trend: 5   },
      { rank: 3, sku: "DAI-003", name: "Almarai UHT Full Cream 1L",  category: "Dairy",         unitsSold: 576, unit: "units", revenue: 17280, trend: 3   },
      { rank: 4, sku: "HPC-004", name: "Head & Shoulders 400ml",     category: "Personal Care", unitsSold: 96,  unit: "cases", revenue: 15360, trend: 0   },
      { rank: 5, sku: "SNK-007", name: "Lay's Max 180g",             category: "Snacks",        unitsSold: 288, unit: "cases", revenue: 14400, trend: 18  },
      { rank: 6, sku: "BEV-021", name: "Nescafé 3-in-1 Original",   category: "Beverages",     unitsSold: 72,  unit: "cases", revenue: 8640,  trend: -4  },
    ],
    lostProducts: [
      { sku: "HPC-009", name: "Ariel 3-in-1 Pods 23ct",    category: "Laundry",       reason: "OOS",        detail: "Out of stock 3 days. Competitor Persil filling 4 facings.",   estLoss: 1920, daysMissing: 3  },
      { sku: "HPC-011", name: "Head & Shoulders Lemon 400ml", category: "Personal Care", reason: "Not Listed", detail: "Never listed. Competitor holds 2 facings in personal care.", estLoss: 3200                  },
      { sku: "BEV-022", name: "Nescafé Gold 200g",          category: "Beverages",     reason: "Delisted",   detail: "Delisted 2 months ago. Premium segment gap remains.",          estLoss: 2400                  },
      { sku: "GRM-005", name: "Gillette Fusion5 4ct",       category: "Grooming",      reason: "Not Listed", detail: "Premium grooming gap. 6 nearby hypermarkets carry it.",       estLoss: 4100                  },
    ],
    crossSell: [
      { sku: "HPC-022", name: "Downy Fabric Softener 2L",    category: "Laundry",   affinity: 87, detail: "Carried alongside Ariel in 73% of hypermarkets in this territory.", opportunity: 8200 },
      { sku: "GRM-005", name: "Gillette Fusion5 4ct",        category: "Grooming",  affinity: 71, detail: "Premium grooming not covered. Strong basket lift with HPC category.", opportunity: 4100 },
      { sku: "BEV-018", name: "Nescafé 3-in-1 30ct",        category: "Beverages", affinity: 68, detail: "Listed at 4 nearby hypermarkets. High-velocity value pack.",           opportunity: 2800 },
      { sku: "SNK-012", name: "Pringles Original 165g",      category: "Snacks",    affinity: 62, detail: "Premium snacks gap. Lay's Max presence supports introduction.",        opportunity: 1900 },
    ],
    aiRecommendations: [
      {
        id: "r1", type: "increase", priority: "High",
        title: "Increase Order Quantity",
        subtitle: "Ariel Liquid 2L — velocity trending +12%",
        detail: "Current avg 18 cases/visit is below the zone benchmark of 22 cases. Suggest increasing to 21 cases next order to reduce OOS risk.",
        impact: "+AED 2,400 monthly opportunity",
        actionLabel: "Add to Order",
      },
      {
        id: "r2", type: "recover", priority: "Critical",
        title: "Recover Lost SKU",
        subtitle: "Ariel 3-in-1 Pods — OOS 3 days",
        detail: "4 facings empty. Competitor Persil occupying the gap. Estimated daily revenue loss: AED 640. Place emergency order and request shelf lock.",
        impact: "AED 1,920 lost in 3 days",
        actionLabel: "Place Urgent Order",
      },
      {
        id: "r3", type: "offer", priority: "Medium",
        title: "Offer New Product",
        subtitle: "Downy Fabric Softener 2L — affinity 87%",
        detail: "Not listed. 73% of hypermarkets in this territory carry it next to Ariel. Basket affinity score of 0.87 suggests high attachment rate.",
        impact: "+AED 8,200 annual opportunity",
        actionLabel: "Propose Listing",
      },
      {
        id: "r4", type: "collect", priority: "Critical",
        title: "Collection Priority",
        subtitle: "AED 12,400 — 18 days overdue",
        detail: "Outstanding balance 18 days past due date. Buyer Ahmad confirmed available today. Escalation threshold at AED 75,000 credit limit. Do not place new order until collected.",
        impact: "AED 12,400 at risk",
        actionLabel: "Initiate Collection",
      },
    ],
    visits: [
      { id: 1, date: "Jun 29, 2026", time: "08:30 AM", status: "Completed", type: "Standard",    rep: "James Al-Farsi",  duration: "45 min", outcome: "Completed standard call. No order placed — buyer delayed Downy listing decision. Rescheduled for Jun 30.", note: "Buyer requested planogram update for July promo." },
      { id: 2, date: "Jun 25, 2026", time: "10:00 AM", status: "Completed", type: "Order",        rep: "James Al-Farsi",  duration: "38 min", outcome: "Order placed: AED 28,400 across 12 SKUs. Ariel 2L +20%.", orderValue: 28400 },
      { id: 3, date: "Jun 22, 2026", time: "09:15 AM", status: "Completed", type: "Collection",   rep: "James Al-Farsi",  duration: "55 min", outcome: "Collected AED 15,000 partial payment. Planogram check — 3 facing gaps noted.", note: "Buyer committed remaining balance by Jun 30." },
      { id: 4, date: "Jun 19, 2026", time: "11:00 AM", status: "Completed", type: "Order",        rep: "James Al-Farsi",  duration: "42 min", outcome: "Order placed: AED 19,800. Summer promo planogram installed.", orderValue: 19800 },
      { id: 5, date: "Jun 15, 2026", time: "09:30 AM", status: "Missed",    type: "Standard",     rep: "James Al-Farsi",                     outcome: "Buyer unavailable — supplier conference. Rescheduled to Jun 19.", note: "Receptionist confirmed buyer returns Jun 17." },
      { id: 6, date: "Jun 12, 2026", time: "08:45 AM", status: "Completed", type: "Promotional",  rep: "James Al-Farsi",  duration: "60 min", outcome: "Q2 promo setup. 5 SKUs in promotional display. Ariel 2L promo — 34% uplift." },
    ],
    copilotQa: [
      { question: "What should I do?",           tags: ["Priority"], answer: "1. **Collect AED 12,400** — 18 days overdue.\n2. **Restore Ariel 3-in-1 Pods** — 3-day OOS.\n3. **Propose Downy Fabric Softener** listing." },
      { question: "Why did sales decrease?",     tags: ["Analysis"], answer: "MTD is 3.2% below target. Root causes: Ariel 3-in-1 OOS (AED 1,920 loss) and Nescafé Gold delisting (AED 2,400/mo). Resolve OOS today to recover." },
      { question: "What products should I offer?", tags: ["Selling"], answer: "Push: Ariel 3-in-1 Pods, Downy 2L, Nescafé 3-in-1 30ct.\nAvoid: Pantene — competitor exclusivity until Sep 2026." },
      { question: "Is this customer high priority?", tags: ["Risk"],  answer: "Yes — Class A, Route D-04 top account. AED 145k MTD. Risk: Low. Only concern is AED 12,400 outstanding — collect today." },
    ],
  },

  2: {
    id: 2,
    name: "Spinneys – JBR",
    code: "SPN-JBR-002",
    classification: "A",
    type: "Supermarket",
    territory: "Dubai North",
    route: "Route D-07 · JBR Coastal",
    region: "JBR Walk, Dubai",
    address: "The Walk at JBR, Jumeirah Beach Residence, Dubai",
    distance: "5.1 km",
    riskLevel: "Low",
    status: "Active",
    buyerName: "Lara Khoury",
    buyerPhone: "+971 55 213 4455",

    creditLimit: 40000,
    outstandingBalance: 0,
    lastInvoice: { date: "Jun 27, 2026", amount: 14200, ref: "INV-2026-0901" },
    lastPayment: { date: "Jun 27, 2026", amount: 14200 },
    collectionPct: 100,

    mtdRevenue: 89500,
    targetMtd: 90000,
    salesLastMonth: 82000,
    ordersCount: 9,
    avgOrder: 9944,
    lastVisit: "Yesterday, 10:00 AM",

    topProducts: [
      { rank: 1, sku: "HPC-001", name: "Ariel Liquid 2L",          category: "Laundry",   unitsSold: 96,  unit: "cases", revenue: 24000, trend: 8  },
      { rank: 2, sku: "BEV-012", name: "Nescafé Classic 200g",      category: "Beverages", unitsSold: 72,  unit: "cases", revenue: 14400, trend: 4  },
      { rank: 3, sku: "DAI-003", name: "Almarai UHT 1L",            category: "Dairy",     unitsSold: 288, unit: "units", revenue: 8640,  trend: 2  },
    ],
    lostProducts: [
      { sku: "ORG-001", name: "Ariel Eco-Organic 1.5L", category: "Laundry",   reason: "Not Listed", detail: "Premium organic segment gap. Spinneys shoppers 2.1× higher basket.", estLoss: 3600 },
    ],
    crossSell: [
      { sku: "BEV-018", name: "Nescafé 3-in-1 30ct", category: "Beverages", affinity: 68, detail: "Not listed. Good value pack for premium shoppers.", opportunity: 1800 },
    ],
    aiRecommendations: [
      { id: "r1", type: "offer",    priority: "Medium",   title: "Propose Organic Range Pilot",  subtitle: "Ariel Eco-Organic — premium segment gap",  detail: "3-SKU pilot, 90-day trial. Spinneys shoppers have 2.1× average basket vs. standard supermarkets.",  impact: "+AED 3,600 monthly opportunity", actionLabel: "Propose Listing" },
      { id: "r2", type: "increase", priority: "Medium",   title: "Increase Ariel 2L Volume",     subtitle: "Trending +8% — at capacity",               detail: "Current 8 cases per visit. Zone benchmark is 11 cases. Upsize before Ramadan promo begins.",              impact: "+AED 720/visit opportunity",    actionLabel: "Adjust Order"    },
    ],
    visits: [
      { id: 1, date: "Jun 28, 2026", time: "10:00 AM", status: "Completed", type: "Order",    rep: "James Al-Farsi", duration: "30 min", outcome: "Order: AED 14,200. Buyer open to organic range discussion next visit.", orderValue: 14200 },
      { id: 2, date: "Jun 24, 2026", time: "09:30 AM", status: "Completed", type: "Standard", rep: "James Al-Farsi", duration: "25 min", outcome: "Planogram check. All facings correct. Confirmed July promotional calendar." },
    ],
    copilotQa: [
      { question: "What should I do?",           tags: ["Priority"], answer: "Spinneys JBR is on track — 99.4% of target.\n1. **Propose organic pilot** — Lara showed interest.\n2. **Confirm July end-cap** — summer promo starts Jul 1." },
      { question: "What products should I offer?", tags: ["Selling"], answer: "Ariel Eco-Organic 1.5L (organic trial) and Nescafé 3-in-1 30ct (value pack not listed)." },
      { question: "Why did sales decrease?",     tags: ["Analysis"], answer: "Sales are on track at 99.4% vs. target. Minor gap is organic segment not listed." },
      { question: "Is this customer high priority?", tags: ["Risk"],  answer: "Yes — Class A. Clean balance, on-target revenue, reliable buyer. Low risk." },
    ],
  },
};

export function getCustomerDetail(id: number): CustomerDetailData | null {
  return CUSTOMER_DETAIL_MAP[id] ?? null;
}
