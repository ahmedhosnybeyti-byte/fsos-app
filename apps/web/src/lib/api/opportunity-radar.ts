import type { CompanyOpportunityStatus, MarketOpportunityType, OpportunityRadarListQuery, OpportunityTeamFollowUpQuery, OpportunityTeamFollowUpStatus, UpdateCompanyOpportunityInput, UpdateOpportunityRadarPreferenceInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";

export type OpportunityConfidence = "HIGH" | "MEDIUM" | "LOW";
export type MarketOpportunityStatus = "OPEN" | "CLOSED" | "EXPIRED";
export type OpportunityAssignee = { id: string; fullName: string; email: string; role?: { code: string } };
export type OpportunityRadarItem = {
  id: string;
  status: CompanyOpportunityStatus;
  contactedAt: string | null;
  notes: string | null;
  outcome: string | null;
  updatedAt: string;
  isFavorite: boolean;
  isHidden: boolean;
  assignedTo: OpportunityAssignee | null;
  assignedBy: OpportunityAssignee | null;
  scheduledVisitFor: string | null;
  marketOpportunity: {
    id: string; vertical: string; opportunityType: MarketOpportunityType; title: string; organization: string;
    description: string; whyRelevant: string; country: string; region: string | null; city: string | null;
    location: string | null; publishedAt: string | null; opportunityDate: string | null; deadlineAt: string | null;
    status: MarketOpportunityStatus; confidence: OpportunityConfidence; phone: string | null; whatsapp: string | null;
    email: string | null; contactUrl: string | null; sourceUrl: string; secondarySourceUrl: string | null;
    sourceName: string; lastVerifiedAt: string;
  };
};

export type OpportunityRadarResponse = { items: OpportunityRadarItem[]; page: number; pageSize: number; total: number; totalPages: number };
export type OpportunityGeoOption = { key: string; label: string };
export type OpportunityLocationsResponse = { regions: OpportunityGeoOption[]; cities: OpportunityGeoOption[] };
export type OpportunityTeamFollowUpItem = {
  id: string;
  status: CompanyOpportunityStatus;
  notes: string | null;
  outcome: string | null;
  orderValue: string | number | null;
  orderQuantity: string | number | null;
  updatedAt: string;
  visitDate: string | null;
  followUpStatus: OpportunityTeamFollowUpStatus;
  assignedTo: OpportunityAssignee | null;
  marketOpportunity: { title: string; organization: string };
};
export type OpportunityTeamFollowUpResponse = {
  items: OpportunityTeamFollowUpItem[];
  summary: { assigned: number; executed: number; ordered: number };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const opportunityRadarApi = {
  list: (query: OpportunityRadarListQuery) => apiFetch<OpportunityRadarResponse>("/opportunity-radar", { query }),
  locations: (query: { region?: string }) => apiFetch<OpportunityLocationsResponse>("/opportunity-radar/locations", { query }),
  assignees: () => apiFetch<OpportunityAssignee[]>("/opportunity-radar/assignees"),
  teamFollowUp: (query: OpportunityTeamFollowUpQuery) => apiFetch<OpportunityTeamFollowUpResponse>("/opportunity-radar/team-follow-up", { query }),
  update: (id: string, input: UpdateCompanyOpportunityInput) => apiFetch(`/opportunity-radar/${id}`, { method: "PATCH", body: input }),
  updatePreference: (id: string, input: UpdateOpportunityRadarPreferenceInput) => apiFetch(`/opportunity-radar/${id}/preference`, { method: "PATCH", body: input }),
};
