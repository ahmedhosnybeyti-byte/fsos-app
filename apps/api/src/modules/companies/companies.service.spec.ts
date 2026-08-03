import { strict as assert } from "node:assert";
import test from "node:test";
import { CompaniesService } from "./companies.service";

test("screen access updates only the requested company and ignores unknown keys", async () => {
  const updates: Array<{ where: { id: string }; data: { featureAccess: unknown } }> = [];
  const service = new CompaniesService(
    {
      company: {
        findUnique: async ({ where }: { where: { id: string } }) => where.id === "company-a" ? { id: "company-a", featureAccess: { files: "LOCKED" } } : null,
        update: async (input: { where: { id: string }; data: { featureAccess: unknown } }) => {
          updates.push(input);
          return { featureAccess: input.data.featureAccess };
        },
      },
    } as never,
    { record: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const result = await service.updateFeatureAccess("company-a", { "smart-loading": "HIDDEN", unknown: "LOCKED" }, "platform-admin");

  assert.deepEqual(updates, [{ where: { id: "company-a" }, data: { featureAccess: { "smart-loading": "HIDDEN" } } }]);
  assert.deepEqual(result, { featureAccess: { "smart-loading": "HIDDEN" } });
});
