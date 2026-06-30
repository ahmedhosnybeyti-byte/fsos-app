// ── Types ──────────────────────────────────────────────────────────────────
export type VisitStatus = "pending" | "in-progress" | "completed" | "skipped";
export type Priority    = "Critical" | "High" | "Medium" | "Low";
export type KpiStatus   = "on-track" | "at-risk" | "achieved";
export type AlertType   = "collection" | "lost-sales" | "credit" | "returns" | "high-priority";

export interface MissionSummary {
  date: string;
  rep: string;
  territory: string;
  plannedVisits: number;
  completedVisits: number;
  estimatedDistanceKm: number;
  workingHoursLabel: string;
  estimatedFinishTime: string;
}

export interface SalesTarget {
  target: number; achieved: number;
}

export interface ProductFocusItem {
  sku: string; name: string; category: string;
  targetCases: number; achievedCases: number;
}

export interface KpiItem {
  label: string; target: string; current: string; status: KpiStatus;
}

export interface DayTargets {
  sales: SalesTarget;
  collection: SalesTarget;
  newCustomers: SalesTarget;
  productFocus: ProductFocusItem[];
  kpis: KpiItem[];
}

export interface MissionCustomer {
  id: number;
  name: string;
  code: string;
  type: string;
  classification: "A" | "B" | "C";
  distanceKm: number;
  priority: Priority;
  objective: string;
  status: VisitStatus;
  estimatedDurationMin: number;
  hasDetailPage: boolean; // true = links to /customers/:id
}

export interface AlertItem {
  id: string;
  type: AlertType;
  severity: Priority;
  customer: string;
  customerId?: number;
  message: string;
  actionLabel?: string;
}

// ── Mock data ──────────────────────────────────────────────────────────────
export const MISSION_SUMMARY: MissionSummary = {
  date: "Monday, Jun 29, 2026",
  rep: "James Al-Farsi",
  territory: "Dubai South",
  plannedVisits: 6,
  completedVisits: 0,
  estimatedDistanceKm: 28.4,
  workingHoursLabel: "08:00 – 17:00",
  estimatedFinishTime: "16:45",
};

export const DAY_TARGETS: DayTargets = {
  sales:         { target: 45000, achieved: 0 },
  collection:    { target: 18000, achieved: 0 },
  newCustomers:  { target: 1,     achieved: 0 },
  productFocus: [
    { sku: "HPC-009", name: "Ariel 3-in-1 Pods 23ct",    category: "Laundry",   targetCases: 15, achievedCases: 0 },
    { sku: "HPC-022", name: "Downy Fabric Softener 2L",   category: "Laundry",   targetCases: 8,  achievedCases: 0 },
    { sku: "BEV-012", name: "Nescafé Classic 200g",       category: "Beverages", targetCases: 24, achievedCases: 0 },
  ],
  kpis: [
    { label: "Visit Compliance",  target: "100%", current: "0%",    status: "on-track"  },
    { label: "Strike Rate",       target: "≥85%", current: "—",     status: "on-track"  },
    { label: "Collection Rate",   target: "≥90%", current: "0%",    status: "at-risk"   },
    { label: "Shelf Availability",target: "≥95%", current: "—",     status: "on-track"  },
  ],
};

export const MISSION_CUSTOMERS: MissionCustomer[] = [
  {
    id: 1,
    name: "Carrefour – Mall of Emirates",
    code: "CAR-MOE-001",
    type: "Hypermarket",
    classification: "A",
    distanceKm: 2.4,
    priority: "Critical",
    objective: "Collect AED 12,400 overdue payment · Recover Ariel Pods OOS · Propose Downy listing",
    status: "pending",
    estimatedDurationMin: 50,
    hasDetailPage: true,
  },
  {
    id: 5,
    name: "LuLu Hypermarket – Deira",
    code: "LLH-DER-005",
    type: "Hypermarket",
    classification: "A",
    distanceKm: 8.2,
    priority: "High",
    objective: "Recover Head & Shoulders Lemon OOS · Confirm July promotional calendar",
    status: "pending",
    estimatedDurationMin: 45,
    hasDetailPage: false,
  },
  {
    id: 2,
    name: "Spinneys – JBR",
    code: "SPN-JBR-002",
    type: "Supermarket",
    classification: "A",
    distanceKm: 5.1,
    priority: "Medium",
    objective: "Routine order · Propose Ariel Eco-Organic pilot listing",
    status: "pending",
    estimatedDurationMin: 35,
    hasDetailPage: true,
  },
  {
    id: 8,
    name: "Union Coop – Al Quoz",
    code: "UNC-AQZ-008",
    type: "Co-operative",
    classification: "B",
    distanceKm: 6.7,
    priority: "Medium",
    objective: "Restocking order · Cross-sell Downy Fabric Softener 2L",
    status: "pending",
    estimatedDurationMin: 30,
    hasDetailPage: false,
  },
  {
    id: 11,
    name: "Al Maya Supermarket – Karama",
    code: "ALM-KRM-011",
    type: "Supermarket",
    classification: "B",
    distanceKm: 9.4,
    priority: "High",
    objective: "Credit review · Propose Nescafé Gold new listing",
    status: "pending",
    estimatedDurationMin: 35,
    hasDetailPage: false,
  },
  {
    id: 14,
    name: "Choithrams – Jumeirah",
    code: "CHO-JUM-014",
    type: "Supermarket",
    classification: "B",
    distanceKm: 7.4,
    priority: "Low",
    objective: "Routine order · Resolve pending return (AED 960)",
    status: "pending",
    estimatedDurationMin: 25,
    hasDetailPage: false,
  },
];

export const ALERTS: AlertItem[] = [
  {
    id: "a1",
    type: "collection",
    severity: "Critical",
    customer: "Carrefour – Mall of Emirates",
    customerId: 1,
    message: "AED 12,400 outstanding — 18 days overdue. Credit hold imminent.",
    actionLabel: "View Account",
  },
  {
    id: "a2",
    type: "lost-sales",
    severity: "High",
    customer: "LuLu Hypermarket – Deira",
    customerId: 5,
    message: "Head & Shoulders Lemon 400ml OOS — 2 days. Competitor filling facings.",
    actionLabel: "View Lost Sales",
  },
  {
    id: "a3",
    type: "credit",
    severity: "High",
    customer: "Al Maya Supermarket – Karama",
    customerId: 11,
    message: "Outstanding balance at 78% of credit limit. Review before placing new order.",
    actionLabel: "Check Credit",
  },
  {
    id: "a4",
    type: "returns",
    severity: "Medium",
    customer: "Choithrams – Jumeirah",
    customerId: 14,
    message: "Pending return of AED 960 — Ariel Pods (packaging damage). Process today.",
    actionLabel: "View Return",
  },
  {
    id: "a5",
    type: "high-priority",
    severity: "High",
    customer: "Carrefour – Mall of Emirates",
    customerId: 1,
    message: "Class A account flagged. 3 consecutive deferred collections. Escalation risk.",
    actionLabel: "View Decision",
  },
];
