export interface CustomerDecision {
  id: string;
  type: "opportunity" | "alert" | "action" | "risk" | "collection";
  title: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  explanation: string;
  actionLabel: string;
}

export interface RecommendedAction {
  id: number;
  text: string;
  sub?: string;
  type: "collect" | "offer" | "avoid" | "request" | "check";
}

export interface ProductRow {
  sku: string;
  name: string;
  category: string;
  detail: string;
  badge?: string;
  badgeColor?: string;
}

export interface VisitRecord {
  id: number;
  date: string;
  time: string;
  status: "Completed" | "Missed" | "Cancelled";
  type: "Order" | "Collection" | "Promotional" | "Survey" | "Standard";
  outcome: string;
  orderValue?: number;
  note?: string;
  rep: string;
  duration?: string;
}

export interface CopilotQA {
  question: string;
  answer: string;
  tags: string[];
}

export interface CustomerDetailData {
  id: number;
  name: string;
  code: string;
  classification: "A" | "B" | "C";
  type: string;
  territory: string;
  region: string;
  address: string;
  distance: string;
  status: "Active" | "At Risk" | "Inactive";
  lastVisit: string;
  lastOrder: { date: string; amount: number; skus: number };
  outstandingBalance: number;
  creditLimit: number;
  mtdRevenue: number;
  ytdRevenue: number;
  targetMtd: number;
  buyerName: string;
  buyerPhone: string;

  decisions: CustomerDecision[];
  actions: RecommendedAction[];

  frequentlyPurchased: ProductRow[];
  lostProducts: ProductRow[];
  crossSell: ProductRow[];
  fastMoving: ProductRow[];

  visits: VisitRecord[];
  copilotQa: CopilotQA[];
}

// ────────────────────────────────────────────────────────────────────────────
// Mock customer detail — Carrefour Mall of Emirates (ID: 1)
// ────────────────────────────────────────────────────────────────────────────
export const CUSTOMER_DETAIL_MAP: Record<number, CustomerDetailData> = {
  1: {
    id: 1,
    name: "Carrefour – Mall of Emirates",
    code: "CAR-MOE-001",
    classification: "A",
    type: "Hypermarket",
    territory: "Dubai South",
    region: "Sheikh Zayed Rd, Dubai",
    address: "Level G, Mall of Emirates, Sheikh Zayed Rd, Dubai",
    distance: "2.4 km",
    status: "Active",
    lastVisit: "Today, 08:30 AM",
    lastOrder: { date: "Jun 25, 2026", amount: 28400, skus: 12 },
    outstandingBalance: 12400,
    creditLimit: 75000,
    mtdRevenue: 145200,
    ytdRevenue: 872400,
    targetMtd: 150000,
    buyerName: "Ahmad Al-Rashid",
    buyerPhone: "+971 50 774 2211",

    decisions: [
      {
        id: "d1",
        type: "opportunity",
        title: "High Sales Opportunity",
        priority: "High",
        explanation: "Q3 summer promo bundle not yet pitched. Comparable accounts achieved +22% uplift with the same package last quarter.",
        actionLabel: "View Promo Brief",
      },
      {
        id: "d2",
        type: "alert",
        title: "Lost Sales Detected",
        priority: "Critical",
        explanation: "Ariel 3-in-1 Pods (4 facings) out of stock for 3 days. Competitor Persil is filling the gap. Estimated daily loss: AED 640.",
        actionLabel: "Place Urgent Order",
      },
      {
        id: "d3",
        type: "action",
        title: "Cross-Sell Opportunity",
        priority: "Medium",
        explanation: "Downy Fabric Softener not listed. 73% of hypermarkets in this territory carry it next to Ariel. Basket affinity score: 0.87.",
        actionLabel: "Propose Listing",
      },
      {
        id: "d4",
        type: "collection",
        title: "Collection Required",
        priority: "Critical",
        explanation: "Outstanding balance AED 12,400 — 18 days overdue. Credit hold threshold at AED 75,000. Buyer confirmed availability today.",
        actionLabel: "Initiate Collection",
      },
      {
        id: "d5",
        type: "risk",
        title: "Customer Risk Level",
        priority: "Low",
        explanation: "Payment trend is consistent. Revenue growing +9% MTD vs. last month. No service complaints in last 90 days. Relationship score: 92/100.",
        actionLabel: "View Risk Report",
      },
    ],

    actions: [
      { id: 1, text: "Collect outstanding payment", sub: "AED 12,400 — overdue 18 days. Buyer Ahmad confirmed available.", type: "collect" },
      { id: 2, text: "Place urgent order for Ariel 3-in-1 Pods", sub: "4 facings empty for 3 days. Suggest 3 cases to restore shelf.", type: "offer" },
      { id: 3, text: "Present Downy Fabric Softener listing proposal", sub: "High basket affinity with Ariel. Use Q3 promo deck.", type: "offer" },
      { id: 4, text: "Do NOT offer Pantene shampoo range", sub: "Competitor has signed exclusivity until Sep 2026. Avoid confrontation.", type: "avoid" },
      { id: 5, text: "Request end-cap space for Nescafé Classic", sub: "Promotion starts July 1. Confirm display agreement before leaving.", type: "request" },
    ],

    frequentlyPurchased: [
      { sku: "HPC-001", name: "Ariel Liquid 2L", category: "Laundry", detail: "Avg 18 cases/visit · Ordered every visit" },
      { sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages", detail: "Avg 12 cases/visit · 3× per week" },
      { sku: "DAI-003", name: "Almarai UHT Full Cream 1L", category: "Dairy", detail: "Avg 48 units/visit · Daily replenishment" },
      { sku: "HPC-004", name: "Head & Shoulders 400ml", category: "Personal Care", detail: "Avg 8 cases/visit · Bi-weekly order" },
      { sku: "SNK-007", name: "Lay's Max 180g", category: "Snacks", detail: "Avg 24 cases/visit · Promotional weeks" },
    ],
    lostProducts: [
      { sku: "HPC-009", name: "Ariel 3-in-1 Pods 23ct", category: "Laundry", detail: "Out of stock 3 days · Est. loss AED 640/day", badge: "OOS", badgeColor: "bg-red-500/10 text-red-600 border-red-500/20" },
      { sku: "HPC-011", name: "Head & Shoulders Lemon 400ml", category: "Personal Care", detail: "Never listed · Competitor holds 2 facings", badge: "Not Listed", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
      { sku: "BEV-021", name: "Nescafé Gold 200g", category: "Beverages", detail: "Delisted 2 months ago · Premium segment gap", badge: "Delisted", badgeColor: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
    ],
    crossSell: [
      { sku: "HPC-022", name: "Downy Fabric Softener 2L", category: "Laundry", detail: "Affinity score 0.87 with Ariel · AED 8,200 opp." },
      { sku: "GRM-005", name: "Gillette Fusion5 Cartridge 4ct", category: "Grooming", detail: "Premium segment not covered · AED 4,100 opp." },
      { sku: "BEV-018", name: "Nescafé 3-in-1 Original 30ct", category: "Beverages", detail: "Listed at 4 nearby accounts · AED 2,800 opp." },
    ],
    fastMoving: [
      { sku: "SNK-007", name: "Lay's Max 180g", category: "Snacks", detail: "Velocity: 8.4 units/day · Stock: 2 days left", badge: "⚡ Urgent", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
      { sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages", detail: "Velocity: 5.1 units/day · Stock: 4 days left", badge: "Fast", badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
      { sku: "DAI-003", name: "Almarai UHT 1L", category: "Dairy", detail: "Velocity: 12.3 units/day · Stock: 1 day left", badge: "⚡ Urgent", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    ],

    visits: [
      { id: 1, date: "Jun 29, 2026", time: "08:30 AM", status: "Completed", type: "Standard", outcome: "Completed standard call. No order placed — buyer delayed decision on Downy listing. Scheduled callback for Jun 30.", rep: "James Al-Farsi", duration: "45 min" },
      { id: 2, date: "Jun 25, 2026", time: "10:00 AM", status: "Completed", type: "Order", outcome: "Order placed: AED 28,400 across 12 SKUs. Ariel 2L quantity increased by 20%. Nescafé Gold removed from order — buyer cited slow movement.", orderValue: 28400, rep: "James Al-Farsi", duration: "38 min", note: "Buyer requested planogram update for July promo." },
      { id: 3, date: "Jun 22, 2026", time: "09:15 AM", status: "Completed", type: "Collection", outcome: "Collected AED 15,000 partial payment. Buyer committed to remaining balance by Jun 30. Planogram check completed — 3 facing gaps noted.", rep: "James Al-Farsi", duration: "55 min", note: "H&S Lemon missing from shelf for 4 days. Buyer says not reordered yet." },
      { id: 4, date: "Jun 19, 2026", time: "11:00 AM", status: "Completed", type: "Order", outcome: "Order placed: AED 19,800. Summer promo planogram installed for Lay's Max and Nescafé. 2 end-caps confirmed for July.", orderValue: 19800, rep: "James Al-Farsi", duration: "42 min" },
      { id: 5, date: "Jun 15, 2026", time: "09:30 AM", status: "Missed", type: "Standard", outcome: "Buyer Ahmad unavailable — attending supplier conference. Receptionist confirmed he returns Jun 17.", rep: "James Al-Farsi", note: "Rescheduled to Jun 19." },
      { id: 6, date: "Jun 12, 2026", time: "08:45 AM", status: "Completed", type: "Promotional", outcome: "Q2 promotional setup completed. 5 SKUs featured in promotional display. Ariel 2L promotion drives 34% uplift vs. regular weeks.", rep: "James Al-Farsi", duration: "60 min", note: "Manager present — positive feedback on Nescafé Classic display." },
    ],

    copilotQa: [
      {
        question: "What should I do?",
        tags: ["Priority", "Today"],
        answer: "Your top 3 priorities today:\n\n1. **Collect AED 12,400** — 18 days overdue. Buyer Ahmad is available. Don't leave without at least a partial payment or a firm commitment date.\n\n2. **Restore Ariel 3-in-1 Pods shelf** — 3-day OOS is costing ~AED 640/day. Place an emergency order and ask category manager to secure facing protection.\n\n3. **Plant the Downy Fabric Softener listing** — Show the Q3 basket affinity deck. Target: get a trial listing approval.",
      },
      {
        question: "Why did sales decrease?",
        tags: ["Analysis"],
        answer: "MTD revenue is AED 145,200 vs. target AED 150,000 — that's a 3.2% shortfall. Two root causes:\n\n• **Ariel 3-in-1 Pods OOS (3 days)** accounts for ~AED 1,920 lost revenue directly.\n• **Nescafé Gold delisting** removed ~AED 2,400/month from the basket — it hasn't been replaced.\n\nPositive signal: Ariel 2L and Lay's Max are trending above plan. If you resolve the OOS today, you can recover to target by month-end.",
      },
      {
        question: "What products should I offer?",
        tags: ["Selling", "Products"],
        answer: "Based on purchase history, affinity scores, and competitor data:\n\n**Push today:**\n• Ariel 3-in-1 Pods — OOS replacement (urgent)\n• Downy Fabric Softener 2L — high affinity, not listed\n• Nescafé 3-in-1 30ct — listed at nearby accounts\n\n**Do NOT push:**\n• Pantene range — competitor exclusivity until Sep 2026\n• Nescafé Gold — buyer delisted it, needs new pitch angle",
      },
      {
        question: "Is this customer high priority?",
        tags: ["Risk", "Priority"],
        answer: "**Yes — Classification A, High Priority.**\n\nCarrefour MoE ranks #1 in your territory by revenue (AED 145k MTD). Key signals:\n\n✓ Consistent 3× weekly visit cadence\n✓ Growing order volumes (+9% MoM)\n✓ Strong buyer relationship (score 92/100)\n\n⚠ Outstanding balance AED 12,400 needs immediate attention — escalates to credit hold if unpaid by Jun 30.",
      },
    ],
  },

  2: {
    id: 2,
    name: "Spinneys – JBR",
    code: "SPN-JBR-002",
    classification: "A",
    type: "Supermarket",
    territory: "Dubai North",
    region: "JBR Walk, Dubai",
    address: "The Walk at JBR, Jumeirah Beach Residence, Dubai",
    distance: "5.1 km",
    status: "Active",
    lastVisit: "Yesterday, 10:00 AM",
    lastOrder: { date: "Jun 27, 2026", amount: 14200, skus: 8 },
    outstandingBalance: 0,
    creditLimit: 40000,
    mtdRevenue: 89500,
    ytdRevenue: 521300,
    targetMtd: 90000,
    buyerName: "Lara Khoury",
    buyerPhone: "+971 55 213 4455",
    decisions: [
      { id: "d1", type: "opportunity", title: "High Sales Opportunity", priority: "Medium", explanation: "Organic range not listed. Spinneys premium shoppers have 2.1× higher basket value. Pilot SKUs available.", actionLabel: "View Organic Range" },
      { id: "d2", type: "risk", title: "Customer Risk Level", priority: "Low", explanation: "Zero outstanding balance. Consistent payment. Revenue on track at 99.4% of target.", actionLabel: "View Risk Report" },
    ],
    actions: [
      { id: 1, text: "Propose organic range trial listing", sub: "3 SKUs, 90-day pilot. Bring product samples.", type: "offer" },
      { id: 2, text: "Confirm July promotional displays", sub: "Summer grilling promo starts Jul 1. Confirm end-cap availability.", type: "request" },
    ],
    frequentlyPurchased: [
      { sku: "HPC-001", name: "Ariel Liquid 2L", category: "Laundry", detail: "Avg 8 cases/visit · Bi-weekly" },
      { sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages", detail: "Avg 6 cases/visit · Weekly" },
    ],
    lostProducts: [
      { sku: "ORG-001", name: "Ariel Eco-Organic 1.5L", category: "Laundry", detail: "Never listed · Premium segment opportunity", badge: "Not Listed", badgeColor: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    ],
    crossSell: [
      { sku: "BEV-018", name: "Nescafé 3-in-1 30ct", category: "Beverages", detail: "Not listed · AED 1,800 opp." },
    ],
    fastMoving: [
      { sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages", detail: "Velocity: 3.2 units/day · Stock: 5 days", badge: "Fast", badgeColor: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    ],
    visits: [
      { id: 1, date: "Jun 28, 2026", time: "10:00 AM", status: "Completed", type: "Order", outcome: "Order placed: AED 14,200. Buyer Lara open to organic range discussion next visit.", orderValue: 14200, rep: "James Al-Farsi", duration: "30 min" },
      { id: 2, date: "Jun 24, 2026", time: "09:30 AM", status: "Completed", type: "Standard", outcome: "Planogram check completed. All facings correct. Confirmed July promotional calendar.", rep: "James Al-Farsi", duration: "25 min" },
    ],
    copilotQa: [
      { question: "What should I do?", tags: ["Priority", "Today"], answer: "Spinneys JBR is performing well — 99.4% of target with zero outstanding balance. Your priorities:\n\n1. **Propose organic range pilot** — Lara showed interest last visit. Bring samples.\n2. **Confirm July end-cap** — Summer promo starts in 2 days. Lock in space today." },
      { question: "What products should I offer?", tags: ["Selling"], answer: "**Best opportunities:**\n• Ariel Eco-Organic 1.5L — premium segment not covered\n• Nescafé 3-in-1 30ct — not listed, good value pack\n\n**Maintain:** Current Ariel + Nescafé Classic volumes are strong." },
      { question: "Why did sales decrease?", tags: ["Analysis"], answer: "Sales are actually on track at 99.4% vs. target. No significant decrease detected. Minor gap is due to organic range not being listed — that's your expansion opportunity." },
      { question: "Is this customer high priority?", tags: ["Risk", "Priority"], answer: "**Yes — Classification A.** Clean balance, on-target revenue, reliable buyer relationship. Low risk, high satisfaction. Focus here is growth, not recovery." },
    ],
  },
};

export function getCustomerDetail(id: number): CustomerDetailData | null {
  return CUSTOMER_DETAIL_MAP[id] ?? null;
}
