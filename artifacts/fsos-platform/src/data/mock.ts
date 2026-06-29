// ── Customers ─────────────────────────────────────────────────────────────────
export const CUSTOMERS = [
  { id: 1, name: "Carrefour – Mall of Emirates", type: "Hypermarket", region: "Dubai South", revenueMtd: 145200, lastVisit: "Today", visitFreq: "3×/week", status: "Active", risk: "Low" },
  { id: 2, name: "Spinneys – JBR", type: "Supermarket", region: "Dubai North", revenueMtd: 89500, lastVisit: "Yesterday", visitFreq: "2×/week", status: "Active", risk: "Low" },
  { id: 3, name: "LuLu Hypermarket – Deira", type: "Hypermarket", region: "Deira", revenueMtd: 198400, lastVisit: "2 days ago", visitFreq: "3×/week", status: "Active", risk: "Low" },
  { id: 4, name: "Union Coop – Al Quoz", type: "Co-op", region: "Central Dubai", revenueMtd: 62300, lastVisit: "1 week ago", visitFreq: "1×/week", status: "At Risk", risk: "High" },
  { id: 5, name: "Waitrose – DIFC", type: "Premium Super", region: "DIFC", revenueMtd: 73100, lastVisit: "3 days ago", visitFreq: "2×/week", status: "Active", risk: "Low" },
  { id: 6, name: "Choithrams – Jumeirah", type: "Supermarket", region: "Jumeirah", revenueMtd: 41800, lastVisit: "5 days ago", visitFreq: "1×/week", status: "At Risk", risk: "Medium" },
  { id: 7, name: "Al Maya – Business Bay", type: "Supermarket", region: "Business Bay", revenueMtd: 55600, lastVisit: "Today", visitFreq: "2×/week", status: "Active", risk: "Low" },
  { id: 8, name: "Géant – Ibn Battuta", type: "Hypermarket", region: "JBR West", revenueMtd: 112700, lastVisit: "Yesterday", visitFreq: "2×/week", status: "Active", risk: "Low" },
];

// ── Visits ────────────────────────────────────────────────────────────────────
export const VISITS = [
  { id: 1, time: "08:30", customer: "Carrefour – Mall of Emirates", type: "Hypermarket", address: "Sheikh Zayed Rd, Dubai", rep: "James Al-Farsi", status: "Completed", duration: "45 min", orders: 3, value: 8400 },
  { id: 2, time: "10:00", customer: "Spinneys – JBR", type: "Supermarket", address: "JBR Walk, Dubai", rep: "James Al-Farsi", status: "Completed", duration: "30 min", orders: 2, value: 4200 },
  { id: 3, time: "11:30", customer: "LuLu – Deira City Centre", type: "Hypermarket", address: "Al Garhoud Rd, Deira", rep: "James Al-Farsi", status: "In Progress", duration: "–", orders: 0, value: 0 },
  { id: 4, time: "13:00", customer: "Waitrose – DIFC", type: "Premium Super", address: "Gate Village, DIFC", rep: "James Al-Farsi", status: "Planned", duration: "–", orders: 0, value: 0 },
  { id: 5, time: "14:30", customer: "Géant – Ibn Battuta", type: "Hypermarket", address: "Ibn Battuta Mall, JBR", rep: "James Al-Farsi", status: "Planned", duration: "–", orders: 0, value: 0 },
  { id: 6, time: "16:00", customer: "Choithrams – Jumeirah", type: "Supermarket", address: "Jumeirah Beach Rd", rep: "James Al-Farsi", status: "Planned", duration: "–", orders: 0, value: 0 },
];

// ── Products / SKUs ───────────────────────────────────────────────────────────
export const PRODUCTS = [
  { id: 1, sku: "HPC-001", name: "Ariel Liquid 2L", category: "Laundry", sales: 4820, units: 1206, growth: 12.4, coverage: 94 },
  { id: 2, sku: "BEV-012", name: "Nescafé Classic 200g", category: "Beverages", sales: 3940, units: 985, growth: 8.1, coverage: 89 },
  { id: 3, sku: "SNK-007", name: "Lay's Max 180g", category: "Snacks", sales: 3210, units: 2675, growth: 21.3, coverage: 76 },
  { id: 4, sku: "HPC-004", name: "Head & Shoulders 400ml", category: "Personal Care", sales: 2980, units: 746, growth: 5.7, coverage: 88 },
  { id: 5, sku: "BEV-008", name: "Lipton Yellow Label 100tb", category: "Beverages", sales: 2540, units: 1270, growth: -3.2, coverage: 82 },
  { id: 6, sku: "DAI-003", name: "Almarai UHT Full Cream 1L", category: "Dairy", sales: 2310, units: 2310, growth: 14.8, coverage: 97 },
];

// ── Reps ──────────────────────────────────────────────────────────────────────
export const REPS = [
  { id: 1, name: "James Al-Farsi", region: "Dubai South", visits: 18, target: 20, revenue: 42500, orders: 32, coverage: 90 },
  { id: 2, name: "Sarah Okonkwo", region: "Dubai North", visits: 20, target: 20, revenue: 51200, orders: 41, coverage: 100 },
  { id: 3, name: "Ahmed Hassan", region: "Deira", visits: 16, target: 20, revenue: 38900, orders: 28, coverage: 80 },
  { id: 4, name: "Priya Sharma", region: "Sharjah", visits: 14, target: 18, revenue: 31400, orders: 22, coverage: 78 },
  { id: 5, name: "Carlos Mendez", region: "Abu Dhabi", visits: 19, target: 22, revenue: 47100, orders: 36, coverage: 86 },
];

// ── Routes ────────────────────────────────────────────────────────────────────
export const ROUTES = [
  { id: 1, name: "Route D-1 – Sheikh Zayed Corridor", stops: 8, completed: 6, coverage: 75, avgTime: "32 min", distance: "24 km", efficiency: 88 },
  { id: 2, name: "Route D-2 – Deira & Bur Dubai", stops: 10, completed: 10, coverage: 100, avgTime: "28 min", distance: "18 km", efficiency: 95 },
  { id: 3, name: "Route D-3 – JBR & Marina", stops: 7, completed: 4, coverage: 57, avgTime: "41 min", distance: "15 km", efficiency: 71 },
  { id: 4, name: "Route D-4 – Downtown & DIFC", stops: 6, completed: 6, coverage: 100, avgTime: "22 min", distance: "9 km", efficiency: 97 },
  { id: 5, name: "Route D-5 – Al Quoz & Nad Al Sheba", stops: 9, completed: 5, coverage: 56, avgTime: "38 min", distance: "31 km", efficiency: 64 },
];

// ── Territory Summary ─────────────────────────────────────────────────────────
export const TERRITORIES = [
  { region: "Dubai South", repCount: 3, customers: 42, revenueMtd: 285400, target: 300000, attainment: 95.1 },
  { region: "Dubai North", repCount: 2, customers: 31, revenueMtd: 198700, target: 200000, attainment: 99.4 },
  { region: "Deira", repCount: 4, customers: 58, revenueMtd: 312900, target: 350000, attainment: 89.4 },
  { region: "Sharjah", repCount: 3, customers: 37, revenueMtd: 174200, target: 220000, attainment: 79.2 },
  { region: "Abu Dhabi", repCount: 5, customers: 64, revenueMtd: 421500, target: 400000, attainment: 105.4 },
];
