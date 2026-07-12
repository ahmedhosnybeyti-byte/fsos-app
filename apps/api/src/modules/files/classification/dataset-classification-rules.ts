// Data, not logic — this is the entire "learning" surface of the
// classifier. Teaching the platform a new dataset type is adding one entry
// here; DatasetClassifierService never changes. See dataset-classifier.service.ts
// for how these are scored, and docs on a future move to DB-stored rules for
// true zero-deploy extensibility (mirrors PlatformSettings' philosophy).

export interface HeaderSignalGroup {
  // Near-synonyms that count as ONE signal — a sheet earns the group's
  // weight once if ANY keyword matches, never once per keyword.
  keywords: string[];
  weight: number;
}

export interface ClassificationRule {
  datasetType: string;
  headerGroups: HeaderSignalGroup[];
  sheetNameKeywords: string[];
  // Lightweight structural (data-pattern) expectations, scored against the
  // sampled rows rather than headers — see analyzeColumnShapes().
  expectsNumericColumn?: boolean;
  expectsDateColumn?: boolean;
}

export const CLASSIFICATION_RULES: ClassificationRule[] = [
  {
    datasetType: "Invoices",
    headerGroups: [
      { keywords: ["invoice number", "invoice no", "invoice id", "inv no", "inv number"], weight: 2 },
      { keywords: ["invoice date", "bill date"], weight: 1 },
      { keywords: ["due date", "payment due"], weight: 1 },
      { keywords: ["amount", "total amount", "grand total", "net amount"], weight: 1 },
      { keywords: ["tax", "vat", "gst"], weight: 1 },
      { keywords: ["customer", "client", "bill to"], weight: 1 },
      { keywords: ["subtotal", "sub total"], weight: 1 },
    ],
    sheetNameKeywords: ["invoice", "invoices", "billing", "sales invoice"],
    expectsNumericColumn: true,
    expectsDateColumn: true,
  },
  {
    datasetType: "Customers",
    headerGroups: [
      { keywords: ["customer id", "customer code", "client id", "account number"], weight: 2 },
      { keywords: ["customer name", "client name", "account name"], weight: 1 },
      { keywords: ["address", "street", "city"], weight: 1 },
      { keywords: ["region", "territory"], weight: 1 },
      { keywords: ["phone", "mobile", "contact number"], weight: 1 },
      { keywords: ["email", "e-mail"], weight: 1 },
      { keywords: ["segment", "category", "tier", "classification"], weight: 1 },
      { keywords: ["credit limit", "credit terms"], weight: 1 },
    ],
    sheetNameKeywords: ["customer", "customers", "clients", "accounts"],
  },
  {
    datasetType: "Payments",
    headerGroups: [
      { keywords: ["payment id", "payment reference", "transaction id", "receipt number", "receipt no"], weight: 2 },
      { keywords: ["payment date", "paid date", "transaction date"], weight: 1 },
      { keywords: ["amount paid", "paid amount", "payment amount"], weight: 1 },
      { keywords: ["payment method", "mode of payment"], weight: 1 },
      { keywords: ["outstanding", "balance due", "remaining balance"], weight: 1 },
      { keywords: ["invoice number", "invoice reference"], weight: 1 },
    ],
    sheetNameKeywords: ["payment", "payments", "receipts"],
    expectsNumericColumn: true,
    expectsDateColumn: true,
  },
  {
    datasetType: "Returns",
    headerGroups: [
      { keywords: ["return id", "rma", "return number", "credit note number", "credit note"], weight: 2 },
      { keywords: ["return date", "returned date"], weight: 1 },
      { keywords: ["return reason", "reason for return"], weight: 1 },
      { keywords: ["returned quantity", "return qty", "qty returned"], weight: 1 },
      { keywords: ["refund amount", "refund"], weight: 1 },
      { keywords: ["original invoice", "invoice reference"], weight: 1 },
    ],
    sheetNameKeywords: ["return", "returns", "refund", "credit note"],
  },
  {
    datasetType: "Products",
    headerGroups: [
      { keywords: ["sku", "product code", "item code", "barcode", "upc"], weight: 2 },
      { keywords: ["product name", "item name", "description"], weight: 1 },
      { keywords: ["category", "brand", "sub category"], weight: 1 },
      { keywords: ["unit price", "list price", "cost price"], weight: 1 },
      { keywords: ["uom", "unit of measure", "pack size"], weight: 1 },
      { keywords: ["weight", "volume"], weight: 1 },
    ],
    sheetNameKeywords: ["product", "products", "items", "catalog"],
  },
  {
    datasetType: "Inventory",
    headerGroups: [
      { keywords: ["stock on hand", "quantity on hand", "available stock", "inventory level"], weight: 2 },
      { keywords: ["warehouse", "location", "bin"], weight: 1 },
      { keywords: ["sku", "product code", "item code"], weight: 1 },
      { keywords: ["reorder level", "reorder point", "min stock"], weight: 1 },
      { keywords: ["batch number", "lot number", "expiry date", "expiration date"], weight: 1 },
    ],
    sheetNameKeywords: ["inventory", "stock", "warehouse", "stock levels"],
    expectsNumericColumn: true,
  },
  {
    datasetType: "Pricing",
    headerGroups: [
      { keywords: ["price list", "price tier", "unit price list", "list price"], weight: 2 },
      { keywords: ["discount", "discount percentage", "discount rate"], weight: 1 },
      { keywords: ["effective date", "valid from", "valid to"], weight: 1 },
      { keywords: ["sku", "product code"], weight: 1 },
      { keywords: ["cost price", "margin", "markup"], weight: 1 },
    ],
    sheetNameKeywords: ["price list", "pricing", "price sheet", "rate card"],
    expectsNumericColumn: true,
  },
  {
    datasetType: "Routes",
    headerGroups: [
      { keywords: ["route id", "route code", "route name"], weight: 2 },
      { keywords: ["driver", "salesman", "sales rep"], weight: 1 },
      { keywords: ["vehicle", "truck", "van"], weight: 1 },
      { keywords: ["sequence", "stop number", "visit order"], weight: 1 },
      { keywords: ["territory", "area", "zone"], weight: 1 },
    ],
    sheetNameKeywords: ["route", "routes", "route plan", "journey plan"],
  },
  {
    datasetType: "Visits",
    headerGroups: [
      { keywords: ["visit id", "visit date", "call date", "check in", "check out"], weight: 2 },
      { keywords: ["outlet", "customer visited", "store visited"], weight: 1 },
      { keywords: ["sales rep", "rep name", "salesman", "merchandiser"], weight: 1 },
      { keywords: ["duration", "time spent"], weight: 1 },
      { keywords: ["visit type", "call type", "purpose"], weight: 1 },
    ],
    sheetNameKeywords: ["visit", "visits", "calls", "call log", "field visits"],
    expectsDateColumn: true,
  },
  {
    datasetType: "Collections",
    headerGroups: [
      { keywords: ["outstanding balance", "overdue amount", "aging", "dso", "days sales outstanding"], weight: 2 },
      { keywords: ["collected amount", "collection amount"], weight: 1 },
      { keywords: ["receivable", "accounts receivable"], weight: 1 },
      { keywords: ["due date", "overdue days"], weight: 1 },
      { keywords: ["customer", "account"], weight: 1 },
    ],
    sheetNameKeywords: ["collection", "collections", "receivables", "aging report", "outstanding"],
    expectsNumericColumn: true,
  },
  {
    datasetType: "Targets",
    headerGroups: [
      { keywords: ["target", "quota", "sales target", "monthly target", "budget"], weight: 2 },
      { keywords: ["achievement", "achieved", "actual vs target"], weight: 1 },
      { keywords: ["kpi", "goal"], weight: 1 },
      { keywords: ["period", "month", "quarter"], weight: 1 },
      { keywords: ["sales rep", "territory", "region"], weight: 1 },
    ],
    sheetNameKeywords: ["target", "targets", "quota", "budget", "kpi"],
    expectsNumericColumn: true,
  },
  {
    datasetType: "Competitors",
    headerGroups: [
      { keywords: ["competitor name", "competitor", "rival brand"], weight: 2 },
      { keywords: ["market share", "competing product"], weight: 1 },
      { keywords: ["competitor price", "competitor sku"], weight: 1 },
      { keywords: ["observed", "survey date"], weight: 1 },
    ],
    sheetNameKeywords: ["competitor", "competitors", "competitive analysis", "market intel"],
  },
];

// Aliases used for Smart Metadata extraction (Detected Region/Branch/Sales
// Rep/Route/Period) — independent of dataset-type classification, applied
// to whichever sheet is ultimately selected.
export const METADATA_FIELD_ALIASES = {
  region: ["region", "territory", "zone", "area"],
  branch: ["branch", "depot", "outlet code", "warehouse"],
  salesRep: ["sales rep", "salesman", "rep name", "representative", "merchandiser"],
  route: ["route", "route name", "route code"],
  date: ["date", "invoice date", "visit date", "transaction date", "payment date", "return date"],
} as const;
