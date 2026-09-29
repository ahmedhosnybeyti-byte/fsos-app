import { strict as assert } from "node:assert";
import test from "node:test";
import { AssistantService } from "./assistant.service";

const user = {
  userId: "user-1",
  companyId: "company-1",
  email: "rep@example.com",
  roleCode: "SALES_REP",
  permissions: [],
  mustChangePassword: false,
  orgUnitId: null,
} as const;

function serviceWith(rieFacade: Record<string, unknown>): AssistantService {
  return new AssistantService(rieFacade as never, {} as never, {} as never, {} as never, {} as never);
}

async function resolve(service: AssistantService, message: string) {
  return (service as unknown as {
    resolveCustomerMention(userInput: typeof user, text: string): Promise<{ customerCode: string; customerName: string } | null>;
  }).resolveCustomerMention(user, message);
}

test("Assistant customer mention uses one compact RIE candidate query and never reads full Customers", async () => {
  let candidateQueries = 0;
  let received: Record<string, unknown> | undefined;
  let fullReads = 0;
  const service = serviceWith({
    queryAssistantCustomerMentionCandidates: async (input: Record<string, unknown>) => {
      candidateQueries++;
      received = input;
      return [{ CustomerCode: "C-100", CustomerName: "North Star" }];
    },
    getEntityRecords: async () => {
      fullReads++;
      throw new Error("full Customers read must not run");
    },
  });

  assert.deepEqual(await resolve(service, "افتح العميل c-100"), { customerCode: "C-100", customerName: "North Star" });
  assert.equal(candidateQueries, 1);
  assert.equal(fullReads, 0);
  assert.deepEqual(received?.candidateCodes, ["c-100"]);
  assert.equal(received?.normalizedMessage, "افتح العميل c-100");
  assert.equal(received?.allowNameMatch, true);
});

test("Assistant customer mention preserves no-match behavior", async () => {
  const service = serviceWith({ queryAssistantCustomerMentionCandidates: async () => [] });
  assert.equal(await resolve(service, "لا يوجد عميل هنا"), null);
});
