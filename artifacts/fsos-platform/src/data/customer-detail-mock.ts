// ── Core types ─────────────────────────────────────────────────────────────
export type Priority       = "Critical" | "High" | "Medium" | "Low";
export type RiskLevel      = "Critical" | "High" | "Medium" | "Low";
export type Classification = "A" | "B" | "C";
export type LostReason     = "OOS" | "Not Listed" | "Delisted" | "Competitor";
export type VisitStatus    = "Completed" | "Missed" | "Cancelled";
export type VisitType      = "Order" | "Collection" | "Promotional" | "Survey" | "Standard";

export interface TodayDecision {
  priority: Priority;
  title: string;
  detail: string;
  context: string;
  primaryAction: string;
  secondaryAction?: string;
}

export interface SalesOpportunityProduct {
  name: string; sku: string; recQty: number; unit: string;
  reason: string; confidence: number;
}

export interface SalesOpportunity {
  expectedMin: number; expectedMax: number; probability: number;
  products: SalesOpportunityProduct[];
}

export interface Collection {
  outstanding: number; daysPastDue: number; creditLimit: number;
  lastPayment: { date: string; amount: number };
  riskLevel: RiskLevel;
  collectionPriority: "Before Order" | "After Order" | "Optional";
  suggestedPhrase: string;
}

export interface LostSaleItem {
  name: string; sku: string; category: string;
  reason: LostReason; stoppedDate: string;
  estimatedLoss: number; recoveryRec: string;
}

export interface CrossSellItem {
  name: string; sku: string; category: string;
  neverPurchased: boolean; reasonForRec: string;
  expectedValue: number; affinity: number;
}

export interface GeoIntelligence {
  nearbyCustomers: { name: string; distance: string; avgOrder: number; classification: Classification }[];
  bestSellingNearby: { name: string; category: string; avgSales: string }[];
  areaRecommendation: string;
}

export interface VisitStrategyStep { step: number; product: string; approach: string }
export interface Objection { objection: string; counter: string }

export interface VisitStrategy {
  greeting: string;
  whatToSell: VisitStrategyStep[];
  questionsToAsk: string[];
  objectionsToExpect: Objection[];
  closingAdvice: string;
}

export interface InvoiceRecord {
  ref: string; date: string; amount: number;
  status: "Paid" | "Outstanding" | "Overdue";
}

export interface PaymentRecord { date: string; amount: number; method: string; ref: string }

export interface ReturnRecord {
  date: string; sku: string; product: string;
  qty: number; reason: string; amount: number;
}

export interface VisitRecord {
  id: number; date: string; time: string;
  status: VisitStatus; type: VisitType;
  outcome: string; orderValue?: number; note?: string;
  rep: string; duration?: string;
}

export interface CustomerInfo {
  name: string; code: string; classification: Classification; type: string;
  territory: string; route: string; region: string; address: string;
  distance: string; riskLevel: RiskLevel; status: string;
  buyerName: string; buyerPhone: string;
  creditLimit: number; mtdRevenue: number; targetMtd: number;
  lastVisit: string; lastInvoice: { date: string; amount: number; ref: string };
}

export interface CustomerDetailData {
  id: number;
  info: CustomerInfo;
  todayDecision: TodayDecision;
  salesOpportunity: SalesOpportunity;
  collection: Collection;
  lostSales: LostSaleItem[];
  crossSell: CrossSellItem[];
  geoIntelligence: GeoIntelligence;
  visitStrategy: VisitStrategy;
  history: {
    visits: VisitRecord[];
    invoices: InvoiceRecord[];
    payments: PaymentRecord[];
    returns: ReturnRecord[];
  };
  // kept for AI panel compatibility
  copilotQa: { question: string; answer: string; tags: string[] }[];
}

// ── Mock data ─────────────────────────────────────────────────────────────
export const CUSTOMER_DETAIL_MAP: Record<number, CustomerDetailData> = {
  1: {
    id: 1,
    info: {
      name: "Carrefour – Mall of Emirates",
      code: "CAR-MOE-001", classification: "A", type: "Hypermarket",
      territory: "Dubai South", route: "Route D-04 · Sheikh Zayed Corridor",
      region: "Sheikh Zayed Rd, Dubai",
      address: "Level G, Mall of Emirates, Sheikh Zayed Rd, Dubai",
      distance: "2.4 km", riskLevel: "Low", status: "Active",
      buyerName: "Ahmad Al-Rashid", buyerPhone: "+971 50 774 2211",
      creditLimit: 75000, mtdRevenue: 145200, targetMtd: 150000,
      lastVisit: "Today, 08:30 AM",
      lastInvoice: { date: "Jun 25, 2026", amount: 28400, ref: "INV-2026-0892" },
    },

    todayDecision: {
      priority: "Critical",
      title: "Collect AED 12,400 before placing any new order",
      detail: "Ahmad Al-Rashid is available today. The outstanding balance is 18 days overdue and is approaching the escalation threshold. Do not accept a partial — a partial collection will not clear the risk flag on this account.",
      context: "مرشدك AI detected 3 previous visits where collection was deferred. This is the 4th opportunity. Credit hold is imminent at AED 75,000 limit — current exposure is 17%.",
      primaryAction: "Initiate Collection",
      secondaryAction: "View Balance History",
    },

    salesOpportunity: {
      expectedMin: 24000, expectedMax: 32000, probability: 87,
      products: [
        { name: "Ariel 3-in-1 Pods 23ct", sku: "HPC-009", recQty: 3, unit: "cases", reason: "OOS for 3 days — urgent shelf recovery. Competitor Persil filling the gap.", confidence: 97 },
        { name: "Ariel Liquid 2L",         sku: "HPC-001", recQty: 21, unit: "cases", reason: "Velocity +12% vs. last month. Increase from 18 to 21 cases to avoid another OOS.", confidence: 94 },
        { name: "Nescafé Classic 200g",    sku: "BEV-012", recQty: 12, unit: "cases", reason: "Regular bi-weekly cycle. Last ordered Jun 25 — restocking is due.", confidence: 89 },
        { name: "Head & Shoulders 400ml",  sku: "HPC-004", recQty: 8,  unit: "cases", reason: "Restocking cycle due. Last ordered Jun 18 — 11-day cycle confirmed.", confidence: 81 },
        { name: "Lay's Max 180g",          sku: "SNK-007", recQty: 24, unit: "cases", reason: "Summer promo momentum. +40% velocity in June. Promo ends Jul 15.", confidence: 77 },
      ],
    },

    collection: {
      outstanding: 12400, daysPastDue: 18, creditLimit: 75000,
      lastPayment: { date: "Jun 22, 2026", amount: 15000 },
      riskLevel: "High",
      collectionPriority: "Before Order",
      suggestedPhrase: "Ahmad, I wanted to clear up the June invoice before we look at the new order. Can we settle the AED 12,400 today — I can process it right now and we can move on to the order straight after.",
    },

    lostSales: [
      { name: "Ariel 3-in-1 Pods 23ct",     sku: "HPC-009", category: "Laundry",       reason: "OOS",        stoppedDate: "Jun 26, 2026", estimatedLoss: 1920, recoveryRec: "Place emergency order of 3 cases from van stock. Request shelf lock to prevent Persil from taking additional facings." },
      { name: "Head & Shoulders Lemon 400ml",sku: "HPC-011", category: "Personal Care", reason: "Not Listed", stoppedDate: "Never listed", estimatedLoss: 3200, recoveryRec: "Present variant expansion pitch. Competitor holds 2 facings. Show displacement data — they can replace a slow-moving P&C SKU." },
      { name: "Nescafé Gold 200g",           sku: "BEV-022", category: "Beverages",     reason: "Delisted",   stoppedDate: "Apr 10, 2026", estimatedLoss: 2400, recoveryRec: "Offer 30-day trial with return guarantee. Reposition as premium upgrade — summer premium beverage trend supports recovery." },
      { name: "Gillette Fusion5 4ct",        sku: "GRM-005", category: "Grooming",      reason: "Not Listed", stoppedDate: "Never listed", estimatedLoss: 4100, recoveryRec: "Use premium grooming gap data. 6 of 9 hypermarkets in this territory now carry it. Zone pressure argument is strong." },
    ],

    crossSell: [
      { name: "Downy Fabric Softener 2L",  sku: "HPC-022", category: "Laundry",   neverPurchased: true, reasonForRec: "Basket affinity 87% with Ariel Liquid — the top-selling SKU. 73% of similar hypermarkets in this corridor carry both brands side-by-side.",    expectedValue: 8200, affinity: 87 },
      { name: "Nescafé 3-in-1 30ct",       sku: "BEV-018", category: "Beverages", neverPurchased: true, reasonForRec: "4 nearby hypermarkets carry this high-velocity value pack. Family shoppers in this catchment area drive strong volume for value coffee packs.",   expectedValue: 2800, affinity: 68 },
      { name: "Pringles Original 165g",    sku: "SNK-012", category: "Snacks",    neverPurchased: true, reasonForRec: "Premium snacks gap. Lay's Max is the anchor SKU — Pringles completes the premium snacks shelf set and targets a different shopper occasion.",      expectedValue: 1900, affinity: 62 },
    ],

    geoIntelligence: {
      nearbyCustomers: [
        { name: "Spinneys – JBR",           distance: "5.1 km", avgOrder: 14200, classification: "A" },
        { name: "LuLu Hypermarket Deira",   distance: "8.2 km", avgOrder: 19800, classification: "A" },
        { name: "Union Coop Al Quoz",       distance: "6.7 km", avgOrder: 8400,  classification: "B" },
        { name: "Choithrams – Jumeirah",    distance: "7.4 km", avgOrder: 6200,  classification: "B" },
      ],
      bestSellingNearby: [
        { name: "Ariel Liquid 2L",          category: "Laundry",   avgSales: "AED 48k/month" },
        { name: "Downy Fabric Softener 2L", category: "Laundry",   avgSales: "AED 18k/month" },
        { name: "Nescafé Classic 200g",     category: "Beverages", avgSales: "AED 22k/month" },
        { name: "Lay's Max 180g",           category: "Snacks",    avgSales: "AED 12k/month" },
      ],
      areaRecommendation: "Sheikh Zayed Corridor is one of the highest-velocity hypermarket zones in Dubai South. Premium SKUs outperform standard pack sizes 2:1. Prioritise Ariel premium variants, Downy listing, and Nescafé Gold recovery to match the zone MTD benchmark of AED 165k/month. This account is AED 20k below zone benchmark — the gap is almost entirely explainable by the 3 unlisted or OOS SKUs.",
    },

    visitStrategy: {
      greeting: "Greet Ahmad by name and open with a positive data point: 'Great news — Ariel is performing really well this month.' Build rapport before any money conversation. Do not mention collection until you are seated.",
      whatToSell: [
        { step: 1, product: "Ariel 3-in-1 Pods (OOS Recovery)", approach: "Open with: 'I noticed we have a gap on Ariel Pods — I have 3 cases on the van right now. Can we get those on shelf today?' Quick, simple, no negotiation required." },
        { step: 2, product: "Ariel Liquid 2L (Volume Increase)", approach: "Show the +12% velocity chart. Suggest 21 cases instead of the usual 18. Frame it as shelf protection: 'We don't want another OOS on your highest-volume SKU.'" },
        { step: 3, product: "Downy Fabric Softener (New Listing)", approach: "Use the 0.87 basket affinity data. Let him hold the product. Show the planogram — 73% of corridor hypermarkets carry it. Offer a 30-day trial with full return option." },
        { step: 4, product: "Nescafé Classic 200g (Routine)", approach: "Routine restocking — 12 cases. Don't over-pitch. Confirm the usual quantity and move on." },
      ],
      questionsToAsk: [
        "Has any other supplier offered you better terms or promotional support recently?",
        "When is your next major promotion window — July or Ramadan planning?",
        "Is Persil giving you promotional support in exchange for those 4 facings they took from Ariel Pods?",
        "What is your fastest-moving laundry pack size this month — 1L or 2L?",
      ],
      objectionsToExpect: [
        { objection: "I don't have shelf space for Downy.", counter: "73% of hypermarkets in this corridor carry Downy next to Ariel — they created the space. I can show you the planogram and suggest which slow-moving SKU to replace. The data takes 2 minutes to review." },
        { objection: "I need to check with the category manager first.", counter: "Understood. Can we get him on a quick call right now — or I can drop the brief with you and follow up tomorrow morning at 9am?" },
        { objection: "Nescafé Gold didn't sell well before.", counter: "The Gold variant underperformed in winter. Q3 summer data shows premium hot drinks spike +28% in June–July in this territory. I can offer a 30-day trial with full return — zero risk to you." },
      ],
      closingAdvice: "Before leaving the store: confirm the collection receipt in writing, get a signature on the order form, and capture Ahmad's Downy decision in the visit notes. Book your next visit within 3 days — do not let another collection cycle slip.",
    },

    history: {
      visits: [
        { id: 1, date: "Jun 29, 2026", time: "08:30 AM", status: "Completed", type: "Standard",   rep: "James Al-Farsi", duration: "45 min", outcome: "Standard call. No order — buyer delayed Downy listing. Rescheduled Jun 30.", note: "Buyer requested July planogram update." },
        { id: 2, date: "Jun 25, 2026", time: "10:00 AM", status: "Completed", type: "Order",      rep: "James Al-Farsi", duration: "38 min", outcome: "Order AED 28,400 · 12 SKUs. Ariel 2L +20%.",  orderValue: 28400 },
        { id: 3, date: "Jun 22, 2026", time: "09:15 AM", status: "Completed", type: "Collection", rep: "James Al-Farsi", duration: "55 min", outcome: "Collected AED 15,000. Planogram check — 3 facing gaps.", note: "Buyer committed remaining balance by Jun 30." },
        { id: 4, date: "Jun 19, 2026", time: "11:00 AM", status: "Completed", type: "Order",      rep: "James Al-Farsi", duration: "42 min", outcome: "Order AED 19,800. Summer promo planogram installed.", orderValue: 19800 },
        { id: 5, date: "Jun 15, 2026", time: "09:30 AM", status: "Missed",    type: "Standard",   rep: "James Al-Farsi",              outcome: "Buyer unavailable — supplier conference.", note: "Rescheduled Jun 19." },
        { id: 6, date: "Jun 12, 2026", time: "08:45 AM", status: "Completed", type: "Promotional",rep: "James Al-Farsi", duration: "60 min", outcome: "Q2 promo setup. 5 SKUs in display. Ariel 2L promo — 34% uplift." },
      ],
      invoices: [
        { ref: "INV-2026-0892", date: "Jun 25, 2026", amount: 28400, status: "Overdue"      },
        { ref: "INV-2026-0847", date: "Jun 19, 2026", amount: 19800, status: "Paid"         },
        { ref: "INV-2026-0801", date: "Jun 12, 2026", amount: 15200, status: "Paid"         },
        { ref: "INV-2026-0754", date: "Jun 5, 2026",  amount: 22100, status: "Paid"         },
        { ref: "INV-2026-0702", date: "May 29, 2026", amount: 18400, status: "Paid"         },
      ],
      payments: [
        { date: "Jun 22, 2026", amount: 15000, method: "Bank Transfer", ref: "TXN-20260622-0044" },
        { date: "Jun 15, 2026", amount: 22100, method: "Cheque",        ref: "CHQ-881234"         },
        { date: "Jun 8, 2026",  amount: 18400, method: "Bank Transfer", ref: "TXN-20260608-0028" },
        { date: "Jun 1, 2026",  amount: 15200, method: "Bank Transfer", ref: "TXN-20260601-0012" },
      ],
      returns: [
        { date: "Jun 20, 2026", sku: "BEV-022", product: "Nescafé Gold 200g",     qty: 12, reason: "Slow movement",  amount: 2400 },
        { date: "May 14, 2026", sku: "HPC-009", product: "Ariel 3-in-1 Pods 23ct", qty: 6, reason: "Packaging damage", amount: 960 },
      ],
    },

    copilotQa: [
      { question: "What should I do?",            tags: ["Priority"], answer: "1. **Collect AED 12,400** — 18 days overdue.\n2. **Restore Ariel 3-in-1 Pods** — 3-day OOS.\n3. **Propose Downy Fabric Softener** listing." },
      { question: "Why did sales decrease?",      tags: ["Analysis"], answer: "MTD is 3.2% below target. Causes: Ariel 3-in-1 OOS (AED 1,920) and Nescafé Gold delisting (AED 2,400/mo)." },
      { question: "What products should I offer?",tags: ["Selling"],  answer: "Push: Ariel 3-in-1 Pods, Downy 2L, Nescafé 3-in-1 30ct.\nAvoid: Pantene — competitor exclusivity until Sep 2026." },
      { question: "Is this customer high priority?",tags: ["Risk"],   answer: "Yes — Class A, Route D-04 top account. AED 145k MTD. Only concern is AED 12,400 outstanding — collect today." },
    ],
  },

  2: {
    id: 2,
    info: {
      name: "Spinneys – JBR", code: "SPN-JBR-002", classification: "A",
      type: "Supermarket", territory: "Dubai North", route: "Route D-07 · JBR Coastal",
      region: "JBR Walk, Dubai", address: "The Walk at JBR, Jumeirah Beach Residence, Dubai",
      distance: "5.1 km", riskLevel: "Low", status: "Active",
      buyerName: "Lara Khoury", buyerPhone: "+971 55 213 4455",
      creditLimit: 40000, mtdRevenue: 89500, targetMtd: 90000,
      lastVisit: "Yesterday, 10:00 AM",
      lastInvoice: { date: "Jun 27, 2026", amount: 14200, ref: "INV-2026-0901" },
    },
    todayDecision: {
      priority: "Medium",
      title: "Propose organic range pilot and confirm July promotional space",
      detail: "Spinneys JBR is performing at 99.4% of target with a clear balance. The opportunity today is growth, not recovery. Lara showed interest in the organic range last visit — bring samples and close the trial.",
      context: "مرشدك AI identified a premium SKU gap worth AED 3,600/month. Zone benchmark shows 8 out of 10 Spinneys stores carry the Ariel Eco-Organic range.",
      primaryAction: "Propose Organic Pilot",
      secondaryAction: "Confirm July End-Cap",
    },
    salesOpportunity: {
      expectedMin: 12000, expectedMax: 16000, probability: 91,
      products: [
        { name: "Ariel Liquid 2L",          sku: "HPC-001", recQty: 8,  unit: "cases", reason: "Regular bi-weekly cycle. Last order Jun 27 — 4 days ago.", confidence: 95 },
        { name: "Nescafé Classic 200g",     sku: "BEV-012", recQty: 6,  unit: "cases", reason: "Weekly restocking. Velocity consistent.", confidence: 90 },
        { name: "Ariel Eco-Organic 1.5L",  sku: "ORG-001", recQty: 3,  unit: "cases", reason: "New listing proposal — 30-day trial. Premium segment gap.", confidence: 62 },
      ],
    },
    collection: {
      outstanding: 0, daysPastDue: 0, creditLimit: 40000,
      lastPayment: { date: "Jun 27, 2026", amount: 14200 },
      riskLevel: "Low", collectionPriority: "Optional",
      suggestedPhrase: "No collection required — account is fully settled.",
    },
    lostSales: [
      { name: "Ariel Eco-Organic 1.5L", sku: "ORG-001", category: "Laundry", reason: "Not Listed", stoppedDate: "Never listed", estimatedLoss: 3600, recoveryRec: "Bring product samples. 8 of 10 Spinneys stores carry this. Use the 'complete the brand' approach with Lara." },
    ],
    crossSell: [
      { name: "Nescafé 3-in-1 30ct", sku: "BEV-018", category: "Beverages", neverPurchased: true, reasonForRec: "High-velocity value pack. Listed at 4 nearby Spinneys. Good for family shopper occasions.", expectedValue: 1800, affinity: 68 },
    ],
    geoIntelligence: {
      nearbyCustomers: [
        { name: "Waitrose JBR",          distance: "0.4 km", avgOrder: 18200, classification: "A" },
        { name: "Choithrams – Dubai Marina", distance: "1.1 km", avgOrder: 6800, classification: "B" },
      ],
      bestSellingNearby: [
        { name: "Ariel Eco-Organic 1.5L", category: "Laundry",   avgSales: "AED 8k/month" },
        { name: "Nescafé Classic 200g",   category: "Beverages", avgSales: "AED 14k/month" },
      ],
      areaRecommendation: "JBR Walk is a premium coastal corridor. Shoppers here have 2.1× higher average basket vs. standard supermarkets. Premium SKU performance is strong — organic, premium personal care, and premium beverages all outperform territory benchmarks. Focus today: get the Ariel Eco-Organic trial listed.",
    },
    visitStrategy: {
      greeting: "Greet Lara warmly — you have a strong relationship here. Open with the account performance: 'You're at 99.4% of target this month — great work on the Ariel volumes.' Then transition into the organic range opportunity.",
      whatToSell: [
        { step: 1, product: "Ariel Eco-Organic 1.5L (Trial Listing)", approach: "Place the product on the counter. 'Lara, this is flying at the other Spinneys — 8 of 10 stores carry it now. Can we do a 30-day trial with full return if it doesn't sell?' No pressure close." },
        { step: 2, product: "Ariel Liquid 2L (Routine)", approach: "Routine restocking — 8 cases. Don't over-pitch. Confirm and move on quickly." },
        { step: 3, product: "Nescafé Classic 200g (Routine)", approach: "6 cases, standard restock. Quick and clean." },
      ],
      questionsToAsk: [
        "How are your premium shoppers responding to the organic food section?",
        "What is selling fastest in personal care this week?",
        "Are you planning any July promotions for summer — beach/outdoor themes?",
      ],
      objectionsToExpect: [
        { objection: "I'm not sure organic will sell here.", counter: "Waitrose, just 400m away, sells 12 cases of Ariel Eco-Organic per month. JBR shopper demographics are identical. 30-day trial with full return — I'll absorb the risk." },
      ],
      closingAdvice: "Before leaving: confirm the organic trial listing (3 cases, 30-day return option), lock in July end-cap dates for summer promotions, and book next visit in 4 days to check Eco-Organic velocity.",
    },
    history: {
      visits: [
        { id: 1, date: "Jun 28, 2026", time: "10:00 AM", status: "Completed", type: "Order", rep: "James Al-Farsi", duration: "30 min", outcome: "Order AED 14,200. Buyer open to organic range next visit.", orderValue: 14200 },
        { id: 2, date: "Jun 24, 2026", time: "09:30 AM", status: "Completed", type: "Standard", rep: "James Al-Farsi", duration: "25 min", outcome: "Planogram check. All facings correct. Confirmed July promo calendar." },
      ],
      invoices: [
        { ref: "INV-2026-0901", date: "Jun 27, 2026", amount: 14200, status: "Paid" },
        { ref: "INV-2026-0855", date: "Jun 22, 2026", amount: 11800, status: "Paid" },
      ],
      payments: [
        { date: "Jun 27, 2026", amount: 14200, method: "Bank Transfer", ref: "TXN-20260627-0018" },
        { date: "Jun 22, 2026", amount: 11800, method: "Bank Transfer", ref: "TXN-20260622-0009" },
      ],
      returns: [],
    },
    copilotQa: [
      { question: "What should I do?",            tags: ["Priority"], answer: "1. **Propose Ariel Eco-Organic pilot** — Lara showed interest.\n2. **Confirm July end-cap** — summer promo starts Jul 1." },
      { question: "What products should I offer?",tags: ["Selling"],  answer: "Ariel Eco-Organic 1.5L (organic trial) and Nescafé 3-in-1 30ct." },
      { question: "Why did sales decrease?",      tags: ["Analysis"], answer: "Sales are on track at 99.4% of target. No significant decrease." },
      { question: "Is this customer high priority?",tags: ["Risk"],   answer: "Yes — Class A. Clean balance, on-target revenue. Focus is growth." },
    ],
  },
};

export function getCustomerDetail(id: number): CustomerDetailData | null {
  return CUSTOMER_DETAIL_MAP[id] ?? null;
}
