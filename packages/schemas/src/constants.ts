export const AUTH_COOKIE_NAMES = {
  accessToken: "fso_access_token",
  refreshToken: "fso_refresh_token",
} as const;

export const TOKEN_TTL = {
  accessTokenMinutes: 15,
  refreshTokenDays: 30,
  // Window to paste the one-time code into the GPT chat after clicking
  // "Launch GPT".
  gptLaunchTokenMinutes: 10,
  // Once verify-access succeeds, the code is promoted into a session token
  // valid for the rest of the conversation.
  gptSessionHours: 4,
} as const;

export const FILE_UPLOAD_LIMITS = {
  // Raised from the original MVP's "5" now that datasets are open-ended
  // (Invoices/Customers/Payments/Returns/Products/Routes/Visits/Inventory/
  // Pricing/Collections/... — see SUGGESTED_DATASET_TYPES) rather than 4
  // fixed role-based types. Still a bounded safety/cost guard, just sized
  // to not immediately block the catalog of datasets this was built for.
  maxActiveFilesPerCompany: 20,
  // Raised from 10MB to 100MB — reps' workbooks sometimes carry formulas
  // (rather than pasted plain values), which inflates file size well past a
  // typical flat data export. 100MB still safely covers a single Excel
  // workbook while keeping the check a real safety/cost guard, not just a
  // formality.
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
  allowedMimeTypes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
  ],
  allowedExtensions: [".xlsx", ".xls"],
} as const;

export const PASSWORD_POLICY = {
  minLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
} as const;

// Trial duration/enablement, and the Custom GPT's base URL, are
// intentionally NOT constants here — they're platform configuration, stored
// in the PlatformSettings table and editable by SUPER_ADMIN without a
// deploy. See apps/api's PlatformSettingsModule.

// Dataset auto-classification confidence bands (0-100). See
// DatasetClassifierService: >= autoAssign is applied silently, between the
// two just needs a one-click confirm, below requireConfirmation forces a
// manual pick.
export const CLASSIFICATION_CONFIDENCE = {
  autoAssign: 90,
  requireConfirmation: 60,
} as const;

export const API_VERSION_PREFIX = "v1";

// GET /gpt/dataset pagination — the hard cap that guarantees a response can
// never again be the whole file (root cause of the ChatGPT
// ResponseTooLargeError this replaced). Sized to stay well under Actions'
// response size ceiling even for wide rows (~20 columns).
//
// maxLimitNarrowProjection/narrowProjectionMaxColumns: a deliberate
// exception for map/heatmap-style requests (e.g. lat/lon/category/total per
// row) that genuinely need every matching row, not a page of them — see the
// July 2026 GPT retest, where the model correctly refused to loop ~20
// sequential getDataset calls itself to build one artifact (a real ChatGPT
// Actions constraint, not a prompt problem). Raising the cap is only safe
// because it's gated on a narrow column projection: filtering already scans
// every matching row in memory regardless of `limit` (see gpt.service.ts's
// filterRows), so a bigger slice costs nothing extra server-side — the
// response-size risk this cap exists for only reappears if the row is wide.
export const GPT_DATASET_QUERY_LIMITS = {
  defaultLimit: 50,
  maxLimit: 100,
  maxLimitNarrowProjection: 5000,
  narrowProjectionMaxColumns: 5,
} as const;

// Route Planning (territory/route balanced-split feature, dashboard-only —
// see PROJECT_LOG.md's "Route-splitting / territory design" section for the
// full design history). maxCustomersPerRequest is a computation-time guard
// (the region-growing algorithm needs an O(n^2) one-time distance matrix),
// not a response-size guard like GPT_DATASET_QUERY_LIMITS — this endpoint is
// called directly by the dashboard, not through a GPT Action.
export const ROUTE_PLANNING_LIMITS = {
  maxGroupCount: 20,
  maxCustomersPerRequest: 5000,
  defaultTolerance: 0.01,
  maxDistinctValues: 300,
} as const;
