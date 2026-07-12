// Lightweight response DTOs mirroring what the API actually returns. The
// frontend deliberately does not import @field-sales-os/database (Prisma
// types) — this file is the boundary, kept in sync by hand with the API's
// serialized shapes.
import type {
  BillingInterval,
  CompanyStatus,
  FileStatus,
  PaymentProviderType,
  PaymentRecordStatus,
  RoleCode,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  UserStatus,
} from "@field-sales-os/schemas";

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description?: string | null;
}

export interface User {
  id: string;
  companyId: string | null;
  roleId: string;
  email: string;
  fullName: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: Role;
  permissions?: string[];
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  billingInterval: BillingInterval;
  maxUsers: number | null;
  features: Record<string, unknown>;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  paymentStatus: SubscriptionPaymentStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  plan: Plan;
  company?: Company;
}

export interface Payment {
  id: string;
  companyId: string;
  subscriptionId: string | null;
  provider: PaymentProviderType;
  amountCents: number;
  currency: string;
  status: PaymentRecordStatus;
  paidAt: string | null;
  createdAt: string;
  company?: Company;
}

export interface DatasetCandidate {
  datasetType: string;
  confidence: number;
}

export interface DetectedFileMetadata {
  period?: { from: string; to: string };
  region?: string[];
  branch?: string[];
  salesRep?: string[];
  route?: string[];
}

export interface MixedSheetSummary {
  sheetIndex: number;
  sheetName: string;
  topCandidate: DatasetCandidate | null;
  rowCount: number;
  headerCount: number;
}

export interface FileRecord {
  id: string;
  companyId: string;
  uploadedByUserId: string;
  datasetType: string;
  datasetTypeConfidence: number | null;
  datasetTypeConfirmed: boolean;
  sheetIndex: number;
  fileName: string;
  sizeBytes: number;
  status: FileStatus;
  isActive: boolean;
  createdAt: string;
  parsedMetadata?: {
    sheetNames: string[];
    rowCount: number;
    headers: string[];
    headerCount: number;
    classification?: {
      candidates: DatasetCandidate[];
      isMixed: boolean;
      sheets?: MixedSheetSummary[];
    };
    detected?: DetectedFileMetadata;
  } | null;
}

export interface PlatformSettings {
  id: string;
  trialEnabled: boolean;
  trialDurationDays: number;
  defaultPlanCode: string;
  autoStartTrialOnRegistration: boolean;
  gptBaseUrl: string;
  updatedAt: string;
}

// What the Custom GPT posts to POST /gpt/render, mirrored back to the
// frontend. `type` is intentionally untyped here (string) — the component
// registry (components/analysis-studio/registry.tsx) is the only place
// that needs to know the current set of renderable block types.
export interface AnalysisBlock {
  type: string;
  id: string;
  title?: string;
  purpose?: string;
  sourceDatasetIds?: string[];
  payload: unknown;
}

export interface AnalysisEventContent {
  narrative?: string;
  blocks: AnalysisBlock[];
}

export interface AnalysisEvent {
  id: string;
  companyId: string;
  userId: string | null;
  reportType: string;
  content: AnalysisEventContent;
  createdAt: string;
}

export interface GptConfig {
  id: string;
  companyId: string;
  name: string;
  apiKeyId: string;
  isActive: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogEntry {
  id: string;
  companyId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
}
