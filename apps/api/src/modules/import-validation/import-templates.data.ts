// FSOS Import Templates — structured field definitions.
//
// Direct code port of docs/import-templates/FSOS_Import_Templates_v1.0.docx
// (approved 2026-07-17). Field names are copied verbatim from
// FSOS_Canonical_Database_v1.0.xlsx (SHA-256 verified). Every field here
// must match that document's §6 per-dataset table exactly — this is not a
// place to invent new constraints; if a constraint isn't in the approved
// document, it doesn't belong here. Changes require a new document version
// (§7 Governance) before the code changes.
//
// Per ADR-002 (Structure-Only Import Validation, 2026-07-19),
// ImportValidationService only reads `name`/`required` from these field
// definitions now (that's what decides HEADER-001). Every other property
// below (`type`, `allowedValues`, `min`/`max`, `fk`, `conditionalRequired`,
// consistencyRules, ...) is retained verbatim as documentation of the
// official template's data contract — useful for a future "download
// official template" feature — but is no longer enforced against uploaded
// row values.

import type { ImportTemplate } from "./import-validation.types";

const WEEKDAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const UNITS = ["Carton", "Pack", "Piece"] as const;

// Small helper so every "amount >= 0" / "amount > 0" field reads the same
// way it does in the approved spec document.
const nonNegative = { min: 0 } as const;
const positive = { min: 0, minExclusive: true } as const;

export const IMPORT_TEMPLATES: readonly ImportTemplate[] = [
  {
    // 18th official entity, added 2026-07-19 alongside single-file
    // multi-sheet upload support — previously listed in
    // OUT_OF_SCOPE_ENTITIES. Unlike every other Canonical Entity, once its
    // sheet passes Import Validation its rows are ALSO ingested into a
    // real Postgres table (SalesCalendar), not just left as Excel bytes —
    // see FilesService.ingestSalesCalendar / schema.prisma's SalesCalendar
    // model doc comment for why.
    id: "IMPORT-SALES-CALENDAR-v1.0",
    entity: "Sales Calendar",
    primaryKey: ["CalendarDate"],
    importOrder: 0,
    dependsOn: [],
    fields: [
      { name: "CalendarDate", required: true, type: "Date" },
      { name: "Day", required: false, type: "Enum", allowedValues: WEEKDAYS },
      { name: "Week", required: false, type: "Integer", min: 1, max: 53 },
      { name: "Month", required: false, type: "Integer", min: 1, max: 12 },
      { name: "Quarter", required: false, type: "Integer", min: 1, max: 4 },
      { name: "Year", required: false, type: "Integer", min: 2000 },
      { name: "WorkingDay", required: false, type: "Enum", allowedValues: ["Yes", "No"] },
      { name: "Holiday", required: false, type: "String", note: "اسم العطلة الرسمية، فارغ = يوم عادي." },
      { name: "Season", required: false, type: "String" },
      { name: "Ramadan", required: false, type: "Enum", allowedValues: ["Yes", "No"] },
      { name: "PromotionSeason", required: false, type: "String" },
    ],
  },
  {
    // 19th template (2026-07-19, AI Visit Copilot Phase 2 — Customer
    // Discovery): optional uploaded list of potential customers. Like Sales
    // Calendar, accepted rows are ALSO ingested into a real Postgres table
    // (Prospect, source=UPLOAD) — see FilesService.ingestProspects.
    id: "IMPORT-PROSPECTS-v1.0",
    entity: "Prospects",
    primaryKey: ["ProspectCode"],
    importOrder: 0,
    dependsOn: [],
    fields: [
      { name: "ProspectCode", required: true, type: "String" },
      { name: "ProspectName", required: true, type: "String" },
      { name: "Channel", required: false, type: "String" },
      { name: "Latitude", required: true, type: "Decimal", min: -90, max: 90 },
      { name: "Longitude", required: true, type: "Decimal", min: -180, max: 180 },
      { name: "City", required: false, type: "String" },
      { name: "Address", required: false, type: "String" },
      { name: "Phone", required: false, type: "String" },
      { name: "Notes", required: false, type: "String" },
    ],
  },
  {
    id: "IMPORT-REGIONS-v1.0",
    entity: "Regions",
    primaryKey: ["RegionID"],
    importOrder: 1,
    dependsOn: [],
    fields: [
      { name: "RegionID", required: true, type: "String" },
      { name: "CompanyID", required: true, type: "String", fk: { entity: "Companies", field: "CompanyID" }, note: "يُحدَّد تلقائيًا من سياق الشركة المسجَّلة." },
      { name: "RegionName", required: true, type: "String" },
      { name: "RegionManager", required: false, type: "String" },
      { name: "Email", required: false, type: "String" },
      { name: "Phone", required: false, type: "String" },
      { name: "WhatsApp", required: false, type: "String" },
      { name: "OfficeLocation", required: false, type: "String" },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Inactive"] },
    ],
  },
  {
    id: "IMPORT-BRANCHES-v1.0",
    entity: "Branches",
    primaryKey: ["BranchID"],
    importOrder: 2,
    dependsOn: ["Regions"],
    fields: [
      { name: "BranchID", required: true, type: "String" },
      { name: "RegionID", required: true, type: "String", fk: { entity: "Regions", field: "RegionID" } },
      { name: "BranchName", required: true, type: "String" },
      { name: "BranchManager", required: false, type: "String" },
      { name: "Email", required: false, type: "String" },
      { name: "Phone", required: false, type: "String" },
      { name: "WhatsApp", required: false, type: "String" },
      { name: "BranchLocation", required: false, type: "String" },
      { name: "City", required: false, type: "String" },
      { name: "Latitude", required: false, type: "Decimal", min: -90, max: 90 },
      { name: "Longitude", required: false, type: "Decimal", min: -180, max: 180 },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Inactive"] },
    ],
  },
  {
    id: "IMPORT-EMPLOYEES-v1.0",
    entity: "Employees",
    primaryKey: ["EmployeeID"],
    importOrder: 3,
    dependsOn: ["Branches", "Employees"],
    fields: [
      { name: "EmployeeID", required: true, type: "String" },
      { name: "Username", required: true, type: "String" },
      { name: "EmployeeName", required: true, type: "String" },
      { name: "Role", required: true, type: "Enum", allowedValues: ["SALES_REP", "SUPERVISOR", "MANAGER", "COMPANY_ADMIN"] },
      { name: "DirectManagerID", required: false, type: "String", fk: { entity: "Employees", field: "EmployeeID" }, note: "علاقة ذاتية (Self-referencing)." },
      { name: "Mobile", required: false, type: "String" },
      { name: "Email", required: true, type: "String" },
      { name: "HireDate", required: false, type: "Date" },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Inactive"] },
      { name: "BranchID", required: true, type: "String", fk: { entity: "Branches", field: "BranchID" } },
    ],
  },
  {
    id: "IMPORT-ROUTES-v1.0",
    entity: "Routes",
    primaryKey: ["RouteID"],
    importOrder: 4,
    dependsOn: ["Branches", "Employees"],
    fields: [
      { name: "RouteID", required: true, type: "String" },
      { name: "RouteName", required: true, type: "String" },
      { name: "Channel", required: false, type: "String" },
      { name: "SalesRepID", required: false, type: "String", fk: { entity: "Employees", field: "EmployeeID" } },
      { name: "SupervisorID", required: false, type: "String", fk: { entity: "Employees", field: "EmployeeID" } },
      { name: "ManagerID", required: false, type: "String", fk: { entity: "Employees", field: "EmployeeID" } },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Inactive"] },
      { name: "BranchID", required: true, type: "String", fk: { entity: "Branches", field: "BranchID" } },
    ],
  },
  {
    id: "IMPORT-ROUTE-ASSIGNMENTS-v1.0",
    entity: "Route Assignments",
    primaryKey: ["AssignmentID"],
    importOrder: 5,
    dependsOn: ["Routes", "Employees"],
    fields: [
      { name: "AssignmentID", required: true, type: "String" },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" } },
      { name: "EmployeeID", required: true, type: "String", fk: { entity: "Employees", field: "EmployeeID" } },
      { name: "Role", required: true, type: "Enum", allowedValues: ["SalesRep", "Supervisor", "Manager"] },
      { name: "StartDate", required: true, type: "Date" },
      { name: "EndDate", required: false, type: "Date", note: "يجب أن تكون بعد StartDate أو تساويه." },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Historical", "Expired"] },
    ],
  },
  {
    id: "IMPORT-PRODUCTS-v1.0",
    entity: "Products",
    primaryKey: ["ProductCode"],
    importOrder: 6,
    dependsOn: [],
    fields: [
      { name: "ProductCode", required: true, type: "String" },
      { name: "Barcode", required: false, type: "String" },
      { name: "ProductName", required: true, type: "String" },
      { name: "Brand", required: false, type: "String" },
      { name: "Category", required: false, type: "String" },
      { name: "BaseUnit", required: true, type: "Enum", allowedValues: UNITS },
      { name: "CartonQty", required: false, type: "Integer", ...positive },
      { name: "PackQty", required: false, type: "Integer", ...positive },
      { name: "PieceQty", required: false, type: "Integer", ...positive },
      { name: "NetWeightKG", required: true, type: "Decimal", ...positive },
      { name: "ProductStatus", required: false, type: "String" },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Inactive"] },
    ],
  },
  {
    id: "IMPORT-PRICELIST-v1.0",
    entity: "Price List",
    primaryKey: ["PriceListCode", "ProductCode", "Unit", "StartDate"],
    importOrder: 7,
    dependsOn: ["Products"],
    fields: [
      { name: "PriceListCode", required: true, type: "String" },
      { name: "PriceListName", required: false, type: "String" },
      { name: "ProductCode", required: true, type: "String", fk: { entity: "Products", field: "ProductCode" } },
      { name: "Unit", required: true, type: "Enum", allowedValues: UNITS },
      { name: "PriceBeforeVAT", required: true, type: "Decimal", ...nonNegative },
      { name: "VATPercent", required: true, type: "Decimal", min: 0, max: 100 },
      { name: "PriceAfterVAT", required: true, type: "Decimal", ...nonNegative },
      { name: "Currency", required: false, type: "String" },
      { name: "StartDate", required: true, type: "Date" },
      { name: "EndDate", required: false, type: "Date", note: "يجب أن تكون بعد StartDate." },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Expired"] },
    ],
    consistencyRules: [
      {
        fields: ["PriceBeforeVAT", "VATPercent", "PriceAfterVAT"],
        ruleLabel: "PriceAfterVAT = PriceBeforeVAT × (1 + VATPercent/100)",
        check: (r) => {
          if (r.PriceBeforeVAT == null || r.VATPercent == null || r.PriceAfterVAT == null) return true;
          const expected = r.PriceBeforeVAT * (1 + r.VATPercent / 100);
          return Math.abs(expected - r.PriceAfterVAT) <= Math.max(0.02, Math.abs(expected) * 0.01);
        },
      },
    ],
  },
  {
    id: "IMPORT-CUSTOMERS-v1.0",
    entity: "Customers",
    primaryKey: ["CustomerCode"],
    importOrder: 8,
    dependsOn: ["Routes", "Branches"],
    fields: [
      { name: "CustomerCode", required: true, type: "String" },
      { name: "CustomerName", required: true, type: "String" },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" } },
      { name: "VisitDay", required: false, type: "Enum", allowedValues: WEEKDAYS },
      { name: "VisitSequence", required: false, type: "Integer", ...positive },
      { name: "Channel", required: false, type: "String" },
      { name: "CustomerClass", required: false, type: "Enum", allowedValues: ["A", "B", "C"] },
      { name: "CustomerType", required: false, type: "String" },
      { name: "Address", required: false, type: "String" },
      { name: "City", required: false, type: "String" },
      { name: "Latitude", required: true, type: "Decimal", min: -90, max: 90 },
      { name: "Longitude", required: true, type: "Decimal", min: -180, max: 180 },
      { name: "Phone", required: false, type: "String" },
      { name: "CommercialRegistration", required: false, type: "String" },
      { name: "TaxNumber", required: false, type: "String" },
      { name: "PaymentTerms", required: false, type: "String" },
      { name: "CreditLimit", required: false, type: "Decimal", ...nonNegative },
      { name: "DefaultPriceListCode", required: false, type: "String", fk: { entity: "Price List", field: "PriceListCode" } },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Active", "Inactive"] },
      { name: "BranchID", required: true, type: "String", fk: { entity: "Branches", field: "BranchID" } },
    ],
  },
  {
    id: "IMPORT-INVOICES-v1.0",
    entity: "Invoices",
    primaryKey: ["InvoiceNo"],
    importOrder: 9,
    dependsOn: ["Customers", "Routes"],
    fields: [
      { name: "InvoiceNo", required: true, type: "String" },
      { name: "InvoiceDate", required: true, type: "Date" },
      { name: "InvoiceTime", required: false, type: "Time" },
      { name: "CustomerCode", required: true, type: "String", fk: { entity: "Customers", field: "CustomerCode" } },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" }, note: "علاقة Snapshot — لا تُعاد مطابقتها مع Route Assignments." },
      { name: "InvoiceType", required: false, type: "Enum", allowedValues: ["Sale", "Exchange"] },
      { name: "PaymentMethod", required: false, type: "Enum", allowedValues: ["Cash", "Credit"] },
      { name: "InvoiceStatus", required: true, type: "Enum", allowedValues: ["Confirmed", "Cancelled"] },
      { name: "TotalBeforeVAT", required: true, type: "Decimal", ...nonNegative },
      { name: "Discount", required: false, type: "Decimal", ...nonNegative },
      { name: "VAT", required: true, type: "Decimal", ...nonNegative },
      { name: "TotalAfterVAT", required: true, type: "Decimal", ...nonNegative },
    ],
    consistencyRules: [
      {
        fields: ["TotalBeforeVAT", "Discount", "VAT", "TotalAfterVAT"],
        ruleLabel: "TotalAfterVAT = TotalBeforeVAT − Discount + VAT",
        check: (r) => {
          if (r.TotalBeforeVAT == null || r.VAT == null || r.TotalAfterVAT == null) return true;
          const discount = r.Discount ?? 0;
          const expected = r.TotalBeforeVAT - discount + r.VAT;
          return Math.abs(expected - r.TotalAfterVAT) <= Math.max(0.02, Math.abs(expected) * 0.01);
        },
      },
    ],
  },
  {
    id: "IMPORT-INVOICE-ITEMS-v1.0",
    entity: "Invoice Items",
    primaryKey: ["InvoiceNo", "LineNo"],
    importOrder: 10,
    dependsOn: ["Invoices", "Products", "Routes"],
    fields: [
      { name: "InvoiceNo", required: true, type: "String", fk: { entity: "Invoices", field: "InvoiceNo" } },
      { name: "LineNo", required: true, type: "Integer", ...positive },
      { name: "ProductCode", required: true, type: "String", fk: { entity: "Products", field: "ProductCode" } },
      { name: "Unit", required: true, type: "Enum", allowedValues: UNITS },
      { name: "Quantity", required: true, type: "Decimal", ...positive },
      { name: "FreeQuantity", required: false, type: "Decimal", ...nonNegative },
      { name: "UnitPriceBeforeVAT", required: true, type: "Decimal", ...nonNegative },
      { name: "Discount", required: false, type: "Decimal", ...nonNegative },
      { name: "VAT", required: true, type: "Decimal", ...nonNegative },
      { name: "NetUnitPrice", required: true, type: "Decimal", ...nonNegative },
      { name: "LineTotal", required: true, type: "Decimal", ...nonNegative },
      { name: "BatchNo", required: false, type: "String" },
      { name: "ExpiryDate", required: false, type: "Date" },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" }, note: "علاقة Snapshot." },
    ],
    consistencyRules: [
      {
        fields: ["Quantity", "NetUnitPrice", "LineTotal"],
        ruleLabel: "LineTotal يجب أن يتسق حسابيًا مع Quantity × NetUnitPrice",
        check: (r) => {
          if (r.Quantity == null || r.NetUnitPrice == null || r.LineTotal == null) return true;
          const expected = r.Quantity * r.NetUnitPrice;
          return Math.abs(expected - r.LineTotal) <= Math.max(0.02, Math.abs(expected) * 0.02);
        },
      },
    ],
  },
  {
    id: "IMPORT-VISITS-v1.0",
    entity: "Visits",
    primaryKey: ["VisitID"],
    importOrder: 11,
    dependsOn: ["Customers", "Routes"],
    fields: [
      { name: "VisitID", required: true, type: "String" },
      { name: "VisitDate", required: true, type: "Date" },
      { name: "CheckInTime", required: false, type: "Time" },
      { name: "CheckOutTime", required: false, type: "Time" },
      { name: "CustomerCode", required: true, type: "String", fk: { entity: "Customers", field: "CustomerCode" } },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" }, note: "علاقة Snapshot." },
      { name: "VisitType", required: false, type: "Enum", allowedValues: ["Planned", "Extra"] },
      { name: "VisitStatus", required: true, type: "Enum", allowedValues: ["Productive", "NonProductive"] },
      {
        name: "NonProductiveReason",
        required: false,
        type: "String",
        conditionalRequired: (row) => String(row.VisitStatus ?? "").trim() === "NonProductive",
        conditionLabel: "VisitStatus = NonProductive",
      },
      { name: "InvoiceNo", required: false, type: "String", fk: { entity: "Invoices", field: "InvoiceNo" } },
      { name: "Latitude", required: false, type: "Decimal", min: -90, max: 90 },
      { name: "Longitude", required: false, type: "Decimal", min: -180, max: 180 },
      { name: "Notes", required: false, type: "String" },
    ],
  },
  {
    id: "IMPORT-VANLOADS-v1.0",
    entity: "Van Loads",
    primaryKey: ["LoadNo", "ProductCode", "Unit"],
    importOrder: 12,
    dependsOn: ["Routes", "Products"],
    fields: [
      { name: "LoadNo", required: true, type: "String" },
      { name: "LoadDate", required: true, type: "Date" },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" } },
      { name: "LoadType", required: false, type: "Enum", allowedValues: ["Load", "Return-to-Warehouse"] },
      { name: "ProductCode", required: true, type: "String", fk: { entity: "Products", field: "ProductCode" } },
      { name: "Unit", required: true, type: "Enum", allowedValues: UNITS },
      { name: "Quantity", required: true, type: "Decimal", ...positive },
      { name: "BatchNo", required: false, type: "String" },
      { name: "ExpiryDate", required: false, type: "Date" },
      { name: "Status", required: false, type: "Enum", allowedValues: ["Confirmed", "Pending"] },
    ],
  },
  {
    id: "IMPORT-VANINVENTORY-v1.0",
    entity: "Van Inventory",
    primaryKey: ["ReportDate", "RouteID", "ProductCode", "Unit"],
    importOrder: 13,
    dependsOn: ["Routes", "Products"],
    fields: [
      { name: "ReportDate", required: true, type: "Date" },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" } },
      { name: "ProductCode", required: true, type: "String", fk: { entity: "Products", field: "ProductCode" } },
      { name: "Unit", required: true, type: "Enum", allowedValues: UNITS },
      { name: "Quantity", required: true, type: "Decimal", ...nonNegative },
      { name: "BatchNo", required: false, type: "String" },
      { name: "ExpiryDate", required: false, type: "Date" },
    ],
  },
  {
    id: "IMPORT-COLLECTIONS-v1.0",
    entity: "Collections",
    primaryKey: ["CollectionNo"],
    importOrder: 14,
    dependsOn: ["Customers", "Routes"],
    fields: [
      { name: "CollectionNo", required: true, type: "String" },
      { name: "ReceiptNo", required: false, type: "String" },
      { name: "CollectionDate", required: true, type: "Date" },
      { name: "CollectionTime", required: false, type: "Time" },
      { name: "CustomerCode", required: true, type: "String", fk: { entity: "Customers", field: "CustomerCode" } },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" }, note: "علاقة Snapshot." },
      { name: "InvoiceNo", required: false, type: "String", fk: { entity: "Invoices", field: "InvoiceNo" }, note: "فارغ = دفعة على الحساب (On-Account)." },
      { name: "Amount", required: true, type: "Decimal", ...positive },
      { name: "PaymentMethod", required: true, type: "Enum", allowedValues: ["Cash", "Cheque", "BankTransfer"] },
      {
        name: "Bank",
        required: false,
        type: "String",
        conditionalRequired: (row) => ["Cheque", "BankTransfer"].includes(String(row.PaymentMethod ?? "").trim()),
        conditionLabel: "PaymentMethod = Cheque أو BankTransfer",
      },
      {
        name: "ChequeNo",
        required: false,
        type: "String",
        conditionalRequired: (row) => String(row.PaymentMethod ?? "").trim() === "Cheque",
        conditionLabel: "PaymentMethod = Cheque",
      },
      { name: "DueDate", required: false, type: "Date" },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Collected", "Pending", "Bounced"] },
      { name: "Notes", required: false, type: "String" },
    ],
  },
  {
    id: "IMPORT-RETURNS-v1.0",
    entity: "Returns",
    primaryKey: ["ReturnNo"],
    importOrder: 15,
    dependsOn: ["Customers", "Routes"],
    fields: [
      { name: "ReturnNo", required: true, type: "String" },
      { name: "ReturnDate", required: true, type: "Date" },
      { name: "ReturnTime", required: false, type: "Time" },
      { name: "CustomerCode", required: true, type: "String", fk: { entity: "Customers", field: "CustomerCode" } },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" }, note: "علاقة Snapshot." },
      { name: "InvoiceNo", required: false, type: "String", fk: { entity: "Invoices", field: "InvoiceNo" } },
      { name: "ReturnType", required: false, type: "Enum", allowedValues: ["Damaged", "Expired", "CustomerRequest"] },
      { name: "TotalAmount", required: true, type: "Decimal", ...nonNegative },
      { name: "Status", required: true, type: "Enum", allowedValues: ["Confirmed", "Pending"] },
    ],
  },
  {
    id: "IMPORT-RETURN-ITEMS-v1.0",
    entity: "Return Items",
    primaryKey: ["ReturnNo", "LineNo"],
    importOrder: 16,
    dependsOn: ["Returns", "Products"],
    fields: [
      { name: "ReturnNo", required: true, type: "String", fk: { entity: "Returns", field: "ReturnNo" } },
      { name: "LineNo", required: true, type: "Integer", ...positive },
      { name: "ProductCode", required: true, type: "String", fk: { entity: "Products", field: "ProductCode" } },
      { name: "Unit", required: true, type: "Enum", allowedValues: UNITS },
      { name: "Quantity", required: true, type: "Decimal", ...positive },
      { name: "ReturnReason", required: false, type: "Enum", allowedValues: ["Damaged", "Expired", "WrongItem", "CustomerRequest"] },
      { name: "BatchNo", required: false, type: "String" },
      { name: "ExpiryDate", required: false, type: "Date" },
      { name: "Amount", required: true, type: "Decimal", ...nonNegative },
    ],
  },
  {
    id: "IMPORT-TARGETS-v1.0",
    entity: "Targets",
    primaryKey: ["Month", "Year", "RouteID"],
    importOrder: 17,
    dependsOn: ["Routes"],
    fields: [
      { name: "Month", required: true, type: "Integer", min: 1 },
      { name: "Year", required: true, type: "Integer", min: 2000 },
      { name: "RouteID", required: true, type: "String", fk: { entity: "Routes", field: "RouteID" } },
      { name: "SalesTarget", required: false, type: "Decimal", ...nonNegative, conditionalRequired: atLeastOneTarget, conditionLabel: "لا يوجد أي مؤشر هدف آخر في السطر" },
      { name: "CollectionTarget", required: false, type: "Decimal", ...nonNegative, conditionalRequired: atLeastOneTarget, conditionLabel: "لا يوجد أي مؤشر هدف آخر في السطر" },
      { name: "WeightTarget", required: false, type: "Decimal", ...nonNegative, conditionalRequired: atLeastOneTarget, conditionLabel: "لا يوجد أي مؤشر هدف آخر في السطر" },
      { name: "ActiveCustomersTarget", required: false, type: "Integer", ...nonNegative, conditionalRequired: atLeastOneTarget, conditionLabel: "لا يوجد أي مؤشر هدف آخر في السطر" },
      { name: "ProductiveCallsTarget", required: false, type: "Integer", ...nonNegative, conditionalRequired: atLeastOneTarget, conditionLabel: "لا يوجد أي مؤشر هدف آخر في السطر" },
      { name: "SKUDistributionTarget", required: false, type: "Integer", ...nonNegative, conditionalRequired: atLeastOneTarget, conditionLabel: "لا يوجد أي مؤشر هدف آخر في السطر" },
    ],
  },
];

// Targets' COND-001 rule (§6.17 of the spec): at least one of the six
// target-indicator fields must be present per row. Applied identically to
// all six fields — if all six are empty, EVERY one of them reports
// COND-001 for that row (matches the document's "يُشترط وجود قيمة واحدة
// على الأقل ... وإلا يُرفض السطر" wording: the row as a whole is invalid).
const TARGET_FIELD_NAMES = ["SalesTarget", "CollectionTarget", "WeightTarget", "ActiveCustomersTarget", "ProductiveCallsTarget", "SKUDistributionTarget"];
function atLeastOneTarget(row: Record<string, unknown>): boolean {
  const anyPresent = TARGET_FIELD_NAMES.some((f) => row[f] !== undefined && row[f] !== null && String(row[f]).trim() !== "");
  return !anyPresent; // "required" only kicks in when NONE of the six are present
}

export const IMPORT_TEMPLATES_BY_ID: ReadonlyMap<string, ImportTemplate> = new Map(IMPORT_TEMPLATES.map((t) => [t.id, t]));

// The one Canonical Entity that is explicitly out of scope for file import
// (§4 of the spec) — Companies is created via onboarding (Company
// Management module), never via an uploaded sheet. Sales Calendar was here
// too until 2026-07-19 (now IMPORT-SALES-CALENDAR-v1.0, above). Listed here
// so the matcher/service can produce a clear message if someone tries to
// upload a file that looks like this instead of silently mismatching.
export const OUT_OF_SCOPE_ENTITIES = ["Companies"] as const;
