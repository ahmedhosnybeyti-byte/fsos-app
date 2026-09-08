import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { assertDemoSeedAllowed } from "./seed-security";
import { disconnectProductionSeed, seedProductionDefaults } from "./seed";

const prisma = new PrismaClient();

async function main() {
  assertDemoSeedAllowed(process.env);
  await seedProductionDefaults();

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  await prisma.user.upsert({
    where: { email: "superadmin@fieldsalesos.app" },
    update: {},
    create: {
      email: "superadmin@fieldsalesos.app",
      passwordHash: await argon2.hash("SuperAdmin123!"),
      fullName: "Platform Super Admin",
      roleId: superAdminRole.id,
      companyId: null,
      status: "ACTIVE",
    },
  });

  const demoCompany = await prisma.company.upsert({
    where: { slug: "acme-demo" },
    update: {},
    create: { name: "Acme Field Sales", slug: "acme-demo", status: "ACTIVE" },
  });
  const trialPlan = await prisma.plan.findUniqueOrThrow({ where: { code: "trial" } });
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);
  await prisma.subscription.upsert({
    where: { id: `${demoCompany.id}-seed-subscription` },
    update: {},
    create: { id: `${demoCompany.id}-seed-subscription`, companyId: demoCompany.id, planId: trialPlan.id, status: "TRIAL", paymentStatus: "UNPAID", trialEndsAt },
  });
  const companyAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "COMPANY_ADMIN" } });
  await prisma.user.upsert({
    where: { email: "admin@acme-demo.test" },
    update: {},
    create: { email: "admin@acme-demo.test", passwordHash: await argon2.hash("DemoAdmin123!"), fullName: "Acme Demo Admin", roleId: companyAdminRole.id, companyId: demoCompany.id, status: "ACTIVE" },
  });
  await prisma.gpt.upsert({
    where: { companyId: demoCompany.id },
    update: {},
    create: { companyId: demoCompany.id, name: "Acme Field Sales Analyst", apiKeyId: "fso_demo_acme", apiKeySecretHash: await argon2.hash("REPLACE_ME_GPT_API_SECRET"), dnaConfig: { tone: "concise", domain: "field-sales-analysis" }, isActive: true },
  });
  console.log("Demo seed complete.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : "Demo seed failed");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectProductionSeed();
  });
