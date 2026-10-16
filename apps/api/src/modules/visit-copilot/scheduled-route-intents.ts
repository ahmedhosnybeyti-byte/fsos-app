import type { Prisma } from "@field-sales-os/database";

export function scheduledRouteIntentWhere(companyId: string, assignedToUserId: string, planDate: string): Prisma.ProspectVisitIntentWhereInput {
  return {
    companyId,
    assignedToUserId,
    scheduledFor: new Date(`${planDate}T00:00:00.000Z`),
    status: "PLANNED",
    OR: [
      { prospectId: { not: null } },
      { companyOpportunity: { is: { companyId, assignedToUserId } } },
    ],
  };
}
