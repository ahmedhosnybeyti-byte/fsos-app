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

test("archives a company without deleting it and allows activation again", async () => {
  const company = { id: "company-a", status: "ACTIVE" };
  const refreshTokenUpdates: unknown[] = [];
  const service = new CompaniesService(
    {
      company: {
        findUnique: async () => company,
        update: async ({ data }: { data: { status: "ACTIVE" | "ARCHIVED" } }) => {
          company.status = data.status;
          return { ...company };
        },
      },
      refreshToken: { updateMany: async (input: unknown) => { refreshTokenUpdates.push(input); } },
    } as never,
    { record: async () => undefined } as never,
    {} as never,
    { emit: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  const archived = await service.transitionStatus("company-a", "ARCHIVE", "platform-admin");
  const activated = await service.transitionStatus("company-a", "ACTIVATE", "platform-admin");

  assert.equal(archived.status, "ARCHIVED");
  assert.equal(activated.status, "ACTIVE");
  assert.equal(refreshTokenUpdates.length, 1);
});
