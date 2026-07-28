// Entity Resolution — Customer resolver.
//
// Thin adapter over the existing Dictionary Engine (resolveMentionedCustomer),
// so Customer participates in the generic 4-step Entity Resolution flow
// without duplicating its matching logic. Customer has no "self-context"
// concept — a customer isn't owned by the logged-in user — so
// resolveSelfOrUniqueScope always returns null; resolution for Customer is
// explicit-mention or history-mention only (steps 1-2), otherwise ambiguous.

import type { EntityRecord } from "../../rie/entity-provider.interface";
import { resolveMentionedCustomer } from "../dictionary-engine";
import type { EntityResolver, ResolvedEntity } from "../entity-resolution";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildCustomerResolver(customers: readonly EntityRecord[]): EntityResolver<unknown> {
  return {
    entityType: "Customer",
    findMention: async (message: string): Promise<ResolvedEntity | null> => {
      const hit = resolveMentionedCustomer(message, customers);
      if (!hit) return null;
      return { entityType: "Customer", id: hit.customerCode, label: hit.customerName };
    },
    resolveSelfOrUniqueScope: async () => null,
    clarificationMessage: "محتاج أعرف تقصد أي عميل بالظبط — اذكر اسمه أو كوده.",
  };
}
