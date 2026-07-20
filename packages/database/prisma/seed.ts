import { PrismaClient, BillingInterval } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: "platform.admin", description: "Full platform access (super admin)" },
  { code: "company.manage", description: "Manage own company profile" },
  { code: "users.manage", description: "Create/edit/disable users" },
  { code: "users.view", description: "View users" },
  { code: "subscriptions.manage", description: "Change plan / subscription status" },
  { code: "subscriptions.view", description: "View subscription details" },
  { code: "payments.manage", description: "Record / reconcile payments" },
  { code: "payments.view", description: "View payment history" },
  { code: "access_control.manage", description: "Manage role assignments" },
  { code: "files.upload.company", description: "Upload Company-scope Excel" },
  { code: "files.upload.manager", description: "Upload Manager-scope Excel" },
  { code: "files.upload.supervisor", description: "Upload Supervisor-scope Excel" },
  { code: "files.upload.route", description: "Upload Route-scope Excel" },
  { code: "files.view", description: "View uploaded files" },
  { code: "gpt.launch", description: "Launch the company's Custom GPT" },
  { code: "gpt.manage", description: "Configure the company's Custom GPT" },
  { code: "usage.view", description: "View usage statistics" },
  { code: "audit.view", description: "View audit logs" },
] as const;

const ROLES: Record<string, { name: string; permissions: string[] }> = {
  SUPER_ADMIN: {
    name: "Super Admin",
    permissions: PERMISSIONS.map((p) => p.code),
  },
  COMPANY_ADMIN: {
    name: "Company Admin",
    permissions: [
      "company.manage",
      "users.manage",
      "users.view",
      "subscriptions.view",
      "payments.view",
      "access_control.manage",
      "files.upload.company",
      "files.upload.manager",
      "files.upload.supervisor",
      "files.upload.route",
      "files.view",
      "gpt.launch",
      "gpt.manage",
      "usage.view",
      "audit.view",
    ],
  },
  MANAGER: {
    name: "Manager",
    permissions: ["files.upload.manager", "files.view", "gpt.launch", "usage.view"],
  },
  SUPERVISOR: {
    name: "Supervisor",
    permissions: ["files.upload.supervisor", "files.view", "gpt.launch"],
  },
  SALES_REP: {
    name: "Sales Rep",
    permissions: ["files.upload.route", "gpt.launch"],
  },
};

const PLANS = [
  {
    code: "trial",
    name: "Trial",
    priceCents: 0,
    billingInterval: BillingInterval.MONTHLY,
    maxUsers: 5,
    features: { analysisPerMonth: 50, support: "community" },
  },
  {
    code: "basic",
    name: "Basic",
    priceCents: 4900,
    billingInterval: BillingInterval.MONTHLY,
    maxUsers: 10,
    features: { analysisPerMonth: 200, support: "email" },
  },
  {
    code: "professional",
    name: "Professional",
    priceCents: 14900,
    billingInterval: BillingInterval.MONTHLY,
    maxUsers: 50,
    features: { analysisPerMonth: 1000, support: "priority" },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceCents: 0,
    billingInterval: BillingInterval.MONTHLY,
    maxUsers: null,
    features: { analysisPerMonth: "unlimited", support: "dedicated", customPricing: true },
  },
];

// Phase 3: Organizational Type Registry defaults. These are the same four
// levels the constitution names (Region -> Branch -> Distribution Center ->
// Route) — seeded once as system rows so the registry is never empty, while
// staying a pure data table: adding a fifth type later (Sales Office,
// Warehouse, Business Unit, ...) is just another upsert here or via the
// SUPER_ADMIN API, never a code change. "ROOT" is the reserved sentinel for
// "directly under the Company".
const ORG_UNIT_TYPES = [
  {
    typeCode: "REGION",
    name: "Region",
    description: "Top-level geographic/administrative grouping of branches",
    allowedParentCodes: ["ROOT"],
    allowedChildCodes: ["BRANCH", "DISTRIBUTION_CENTER"],
  },
  {
    typeCode: "BRANCH",
    name: "Branch",
    description: "Company's official MVP operational level",
    // Phase 10 Company Policy: "no Branch without Region" — applied
    // prospectively only (per explicit approval). Existing companies whose
    // Branch already sits directly under the Company (parentId=null, valid
    // under the old registry row) are grandfathered and untouched; this
    // change only affects newly *created* org units from now on. See
    // OrgUnitsService.ensureDefaultRegion for how new/updated companies stay
    // compliant automatically.
    allowedParentCodes: ["REGION"],
    allowedChildCodes: ["ROUTE"],
  },
  {
    typeCode: "DISTRIBUTION_CENTER",
    name: "Distribution Center",
    description: "Logistics/warehousing unit, reserved for future phases",
    allowedParentCodes: ["ROOT", "REGION"],
    allowedChildCodes: [],
  },
  {
    typeCode: "ROUTE",
    name: "Route",
    description: "Field sales route, reserved for future phases",
    allowedParentCodes: ["BRANCH"],
    allowedChildCodes: [],
  },
] as const;

// Phase 6: Data Source Type Registry defaults — the types the constitution
// names explicitly. Adding an 10th type later is just another upsert here
// or via the SUPER_ADMIN API, never a code change.
const DATA_SOURCE_TYPES = [
  { typeCode: "EXCEL_FILE", name: "Excel File", description: "Uploaded .xlsx workbook" },
  { typeCode: "CSV_FILE", name: "CSV File", description: "Uploaded .csv file" },
  { typeCode: "SQL_SERVER", name: "SQL Server", description: "Microsoft SQL Server database connection" },
  { typeCode: "POSTGRESQL", name: "PostgreSQL", description: "PostgreSQL database connection" },
  { typeCode: "MYSQL", name: "MySQL", description: "MySQL / MariaDB database connection" },
  { typeCode: "ORACLE", name: "Oracle", description: "Oracle database connection" },
  { typeCode: "REST_API", name: "REST API", description: "Generic REST API endpoint" },
  { typeCode: "ERP_CONNECTOR", name: "ERP Connector", description: "ERP system connector (SAP, Oracle EBS, ...)" },
  { typeCode: "CLOUD_STORAGE", name: "Cloud Storage", description: "Cloud object storage bucket (S3-compatible, ...)" },
] as const;

// Phase 7: Basic Schema Registry defaults — reuses the exact category
// vocabulary the file classifier (apps/api/.../classification/dataset-
// classification-rules.ts) already produces, normalized the same way
// ImportEngine's File Mapping does (upper snake case). `expectedColumns`
// intentionally left empty for every row: this is the "Basic" registry the
// constitution asks for — strict per-column enforcement is a future
// enhancement, not required for Phase 7/8 to ship.
const SCHEMA_DEFINITIONS = [
  { entityName: "INVOICES", description: "Invoices" },
  { entityName: "INVOICE_ITEMS", description: "Invoice Items" },
  { entityName: "CUSTOMERS", description: "Customers" },
  { entityName: "PAYMENTS", description: "Payments" },
  { entityName: "RETURNS", description: "Returns" },
  { entityName: "PRODUCTS", description: "Products" },
  { entityName: "INVENTORY", description: "Inventory" },
  { entityName: "PRICING", description: "Pricing" },
  { entityName: "ROUTES", description: "Routes" },
  { entityName: "EMPLOYEES", description: "Employees" },
  { entityName: "VISITS", description: "Visits" },
  { entityName: "COLLECTIONS", description: "Collections" },
  { entityName: "TARGETS", description: "Targets" },
  { entityName: "COMPETITORS", description: "Competitors" },
] as const;

async function main() {
  console.log("Seeding basic schema registry...");
  for (const def of SCHEMA_DEFINITIONS) {
    await prisma.schemaDefinition.upsert({
      where: { entityName: def.entityName },
      update: { description: def.description },
      create: { ...def, isSystem: true },
    });
  }

  console.log("Seeding data source type registry...");
  for (const type of DATA_SOURCE_TYPES) {
    await prisma.dataSourceType.upsert({
      where: { typeCode: type.typeCode },
      update: { name: type.name, description: type.description },
      create: { ...type, isSystem: true },
    });
  }

  console.log("Seeding organizational unit type registry...");
  for (const type of ORG_UNIT_TYPES) {
    await prisma.orgUnitTypeDefinition.upsert({
      where: { typeCode: type.typeCode },
      update: {
        name: type.name,
        description: type.description,
        allowedParentCodes: [...type.allowedParentCodes],
        allowedChildCodes: [...type.allowedChildCodes],
      },
      create: { ...type, allowedParentCodes: [...type.allowedParentCodes], allowedChildCodes: [...type.allowedChildCodes], isSystem: true },
    });
  }

  console.log("Seeding permissions...");
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {},
      create: permission,
    });
  }

  console.log("Seeding roles...");
  for (const [code, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: def.name },
      create: { code, name: def.name, isSystem: true },
    });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: def.permissions } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log("Seeding plans...");
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }

  console.log("Seeding platform settings...");
  await prisma.platformSettings.upsert({
    where: { id: "platform_settings" },
    update: {},
    create: { id: "platform_settings" }, // column defaults: trial on, 14 days, "trial" plan, auto-start on, real GPT base URL
  });

  console.log("Seeding platform super admin...");
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const superAdminPassword = "SuperAdmin123!";
  await prisma.user.upsert({
    where: { email: "superadmin@fieldsalesos.app" },
    update: {},
    create: {
      email: "superadmin@fieldsalesos.app",
      passwordHash: await argon2.hash(superAdminPassword),
      fullName: "Platform Super Admin",
      roleId: superAdminRole.id,
      companyId: null,
      status: "ACTIVE",
    },
  });

  console.log("Seeding demo company...");
  const demoCompany = await prisma.company.upsert({
    where: { slug: "acme-demo" },
    update: {},
    create: {
      name: "Acme Field Sales",
      slug: "acme-demo",
      status: "ACTIVE",
    },
  });

  const trialPlan = await prisma.plan.findUniqueOrThrow({ where: { code: "trial" } });
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  await prisma.subscription.upsert({
    where: { id: `${demoCompany.id}-seed-subscription` },
    update: {},
    create: {
      id: `${demoCompany.id}-seed-subscription`,
      companyId: demoCompany.id,
      planId: trialPlan.id,
      status: "TRIAL",
      paymentStatus: "UNPAID",
      trialEndsAt,
    },
  });

  const companyAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "COMPANY_ADMIN" } });
  const demoAdminPassword = "DemoAdmin123!";
  await prisma.user.upsert({
    where: { email: "admin@acme-demo.test" },
    update: {},
    create: {
      email: "admin@acme-demo.test",
      passwordHash: await argon2.hash(demoAdminPassword),
      fullName: "Acme Demo Admin",
      roleId: companyAdminRole.id,
      companyId: demoCompany.id,
      status: "ACTIVE",
    },
  });

  const demoGptSecret = "REPLACE_ME_GPT_API_SECRET";
  await prisma.gpt.upsert({
    where: { companyId: demoCompany.id },
    update: {},
    create: {
      companyId: demoCompany.id,
      name: "Acme Field Sales Analyst",
      apiKeyId: "fso_demo_acme",
      apiKeySecretHash: await argon2.hash(demoGptSecret),
      dnaConfig: { tone: "concise", domain: "field-sales-analysis" },
      isActive: true,
    },
  });

  console.log("\nSeed complete.");
  console.log("-----------------------------------------");
  console.log("Super Admin login:");
  console.log("  email:    superadmin@fieldsalesos.app");
  console.log(`  password: ${superAdminPassword}`);
  console.log("Demo Company Admin login:");
  console.log("  email:    admin@acme-demo.test");
  console.log(`  password: ${demoAdminPassword}`);
  console.log("Demo GPT API key (for testing /gpt/verify-access):");
  console.log("  fso_demo_acme." + demoGptSecret);
  console.log("-----------------------------------------");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
