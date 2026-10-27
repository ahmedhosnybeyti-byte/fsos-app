import { getCompanyFeatureAccessState } from "@field-sales-os/schemas";
import type { User } from "./types";

type VisitActor = Pick<User, "companyId" | "role" | "permissions" | "featureAccess">;

export function canExecuteVisits(user: VisitActor | null | undefined) {
  return !!user?.companyId && user.role.code === "SALES_REP"
    && ["sfa.access", "visits.execute"].every(permission => user.permissions?.includes(permission))
    && getCompanyFeatureAccessState(user.featureAccess, "visit-copilot") === "ENABLED";
}

export function showVisitExecution(user: VisitActor | null | undefined, mode: string | undefined) {
  return mode === "FULL_ERP" && canExecuteVisits(user);
}
