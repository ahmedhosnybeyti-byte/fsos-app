import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { normalizeCompanyFeatureAccess, type CompanyFeatureAccess, type CompanyStatus, type CompanyLifecycleEvent, type CompanyAccountType, type CreatePlatformCompanyInput, type DiscoveryProvider } from "@field-sales-os/schemas";
import { AppConfigService } from "../../common/config/app-config.service";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformEventsService } from "../governance/platform-events.service";
import { encryptCredentials, decryptCredentials } from "../data-sources/credential-cipher.util";
import { OrgUnitsService } from "./org-units.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { generateTemporaryPassword } from "../auth/temporary-password";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "company"
  );
}

// The lifecycle state machine from Phase 2's spec: Draft -[Create]-> ...
// actually "Create" itself produces Draft/Configuring (handled by
// provisionCompany); this map governs the four explicit transitions a
// COMPANY_ADMIN/SUPER_ADMIN can trigger afterwards.
//
// Customer Discovery credentials (provider-agnostic, approved 2026-07-19):
// discoveryCredentialsEncrypted is ONE encrypted blob holding a flat map of
// provider id -> that provider's own JSON-stringified credentials (e.g.
// { GOOGLE: '{"apiKey":"..."}' }) — see readDiscoveryCredentials/
// writeDiscoveryCredentials below. Profile responses never echo it back,
// only whether the CURRENTLY SELECTED provider has a credential stored —
// mirroring data-sources' hasCredentials convention.
function toPublicProfile<T extends { discoveryProvider: string; discoveryCredentialsEncrypted: string | null }>(
  profile: T,
  appConfig: AppConfigService,
) {
  const { discoveryCredentialsEncrypted, ...rest } = profile;
  let byProvider: Record<string, string> = {};
  if (discoveryCredentialsEncrypted) {
    try {
      byProvider = decryptCredentials(appConfig.values.jwt.accessSecret, discoveryCredentialsEncrypted);
    } catch {
      // Malformed ciphertext must never break profile reads — surfaces as
      // "no credentials configured" and gets caught properly at search time.
      byProvider = {};
    }
  }
  return { ...rest, hasDiscoveryCredentials: Boolean(byProvider[profile.discoveryProvider]) };
}

// Merges a single provider's plain credential object into the existing
// encrypted blob (or clears that provider's entry when `plain` is null),
// re-encrypting the whole flat map. Every other provider's stored
// credentials are left untouched — switching providers back and forth never
// loses a previously-saved key.
function writeDiscoveryCredentials(
  appConfig: AppConfigService,
  currentEncrypted: string | null,
  providerId: string,
  plain: Record<string, string> | null,
): string | null {
  let byProvider: Record<string, string> = {};
  if (currentEncrypted) {
    try {
      byProvider = decryptCredentials(appConfig.values.jwt.accessSecret, currentEncrypted);
    } catch {
      byProvider = {};
    }
  }
  if (plain === null) {
    delete byProvider[providerId];
  } else {
    byProvider[providerId] = JSON.stringify(plain);
  }
  if (Object.keys(byProvider).length === 0) return null;
  return encryptCredentials(appConfig.values.jwt.accessSecret, byProvider);
}

const STATUS_TRANSITIONS: Record<CompanyLifecycleEvent, { from: CompanyStatus[]; to: CompanyStatus }> = {
  CREATE: { from: [], to: "DRAFT" },
  ACTIVATE: { from: ["DRAFT", "CONFIGURING", "SUSPENDED", "ARCHIVED"], to: "ACTIVE" },
  SUSPEND: { from: ["ACTIVE"], to: "SUSPENDED" },
  REACTIVATE: { from: ["SUSPENDED"], to: "ACTIVE" },
  ARCHIVE: { from: ["ACTIVE", "SUSPENDED", "DRAFT", "CONFIGURING"], to: "ARCHIVED" },
};

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly orgUnitsService: OrgUnitsService,
    private readonly platformEventsService: PlatformEventsService,
    private readonly appConfig: AppConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async createCompany(name: string, tx: PrismaTx = this.prisma, accountType?: CompanyAccountType) {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
      try {
        // Self-serve signup previously created a Company with no explicit
        // status (defaulted at the DB level). Phase 2 makes the lifecycle
        // explicit: a brand-new company starts life as DRAFT, not ACTIVE —
        // see provisionCompany() for the full Create -> Configuring flow.
        return await tx.company.create({ data: { name, slug, status: "DRAFT", accountType, maxExcelUploadSizeMb: 100 } });
      } catch (err) {
        if (isUniqueConstraintError(err, "slug") && attempt < 4) continue;
        throw err;
      }
    }
    throw new ConflictException("Could not generate a unique company identifier");
  }

  // Company Provisioning Engine (Phase 2): orchestrates the full "Create ->
  // Configure" span for a brand-new company in one transaction — the
  // Company row itself, its editable Profile, and a single default Branch
  // so the org structure is never empty. Deliberately does NOT touch users,
  // subscriptions, or any operational data — those remain the caller's
  // responsibility (see AuthService.register, which composes this with
  // UsersService/SubscriptionsService in its own transaction).
  async provisionCompany(name: string, tx: PrismaTx = this.prisma, accountType?: CompanyAccountType) {
    const company = await this.createCompany(name, tx, accountType);

    await tx.companyProfile.create({ data: { companyId: company.id } });

    // Phase 3: default Branch is created through the general Organizational
    // Structure engine. Phase 10 Company Policy ("no Branch without
    // Region") means it now sits under an auto-created default Region
    // rather than directly under the Company — see ensureDefaultRegion.
    const defaultRegion = await this.orgUnitsService.ensureDefaultRegion(company.id, tx);
    const defaultBranch = await this.orgUnitsService.create(
      company.id,
      { type: "BRANCH", code: "MAIN", name: "الفرع الرئيسي", parentId: defaultRegion.id },
      tx,
    );

    // Provisioning immediately hands the company off to Configuring — Draft
    // is reserved for a not-yet-provisioned shell, which provisionCompany
    // never leaves behind.
    const configured = await tx.company.update({ where: { id: company.id }, data: { status: "CONFIGURING" } });

    // Phase 9 Platform Event — fire-and-forget, never blocks provisioning.
    await this.platformEventsService.emit("CompanyCreated", {
      companyId: configured.id,
      entityType: "Company",
      entityId: configured.id,
    });

    return { company: configured, branch: defaultBranch };
  }

  async createPlatformCompany(input: CreatePlatformCompanyInput, actorUserId: string) {
    const temporaryPassword = generateTemporaryPassword();
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({ data: { name: input.name, slug: input.slug, status: input.initialStatus, maxExcelUploadSizeMb: 100 } });
        await tx.companyProfile.create({ data: { companyId: company.id } });
        const region = await this.orgUnitsService.ensureDefaultRegion(company.id, tx);
        await this.orgUnitsService.create(company.id, { type: "BRANCH", code: "MAIN", name: "Main Branch", parentId: region.id }, tx);
        const role = await tx.role.findUnique({ where: { code: "COMPANY_ADMIN" } });
        if (!role) throw new NotFoundException("COMPANY_ADMIN role not found");
        const admin = await tx.user.create({ data: { companyId: company.id, roleId: role.id, email: input.adminEmail, fullName: input.adminFullName, passwordHash: await argon2.hash(temporaryPassword), mustChangePassword: true }, select: { id: true, email: true, fullName: true, mustChangePassword: true } });
        const subscription = await this.subscriptionsService.createInitialSubscription(company.id, tx, input.initialPlanCode);
        await this.auditLogService.record({ companyId: company.id, userId: actorUserId, action: "company.create", entityType: "Company", entityId: company.id, metadata: { after: { name: company.name, slug: company.slug, status: company.status } } }, tx);
        await this.auditLogService.record({ companyId: company.id, userId: actorUserId, action: "user.create", entityType: "User", entityId: admin.id, metadata: { roleCode: "COMPANY_ADMIN", mustChangePassword: true } }, tx);
        await this.auditLogService.record({ companyId: company.id, userId: actorUserId, action: "subscription.create", entityType: "Subscription", entityId: subscription.id, metadata: { planCode: subscription.plan.code, status: subscription.status } }, tx);
        return { company, admin, subscription };
      });
      return { ...result, temporaryPassword };
    } catch (error) {
      if (isUniqueConstraintError(error, "slug")) throw new ConflictException("Company slug already exists");
      if (isUniqueConstraintError(error, "email")) throw new ConflictException("An account with this email already exists");
      throw error;
    }
  }
  async getAdminDetails(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: { subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" } }, users: { select: { id: true, email: true, fullName: true, status: true, mustChangePassword: true, createdAt: true, updatedAt: true, role: true }, orderBy: { createdAt: "asc" } }, payments: { orderBy: { createdAt: "desc" } } } });
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }
  async getFeatureAccess(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { featureAccess: true } });
    if (!company) throw new NotFoundException("Company not found");
    return { featureAccess: normalizeCompanyFeatureAccess(company.featureAccess) };
  }

  async updateFeatureAccess(companyId: string, featureAccess: Record<string, unknown>, actorUserId: string) {
    const existing = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, featureAccess: true } });
    if (!existing) throw new NotFoundException("Company not found");
    const normalized = normalizeCompanyFeatureAccess(featureAccess) as CompanyFeatureAccess;
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { featureAccess: normalized } });
    await this.auditLogService.record({ companyId, userId: actorUserId, action: "company.feature_access.update", entityType: "Company", entityId: companyId, metadata: { before: normalizeCompanyFeatureAccess(existing.featureAccess), after: normalized } });
    return { featureAccess: normalizeCompanyFeatureAccess(updated.featureAccess) };
  }

  // Validated lifecycle state machine (Phase 2's Draft/Configuring/Active/
  // Suspended/Archived diagram). Every transition is audit-logged via the
  // existing generic AuditLog table — no dedicated lifecycle-event table.
  async transitionStatus(
    companyId: string,
    event: CompanyLifecycleEvent,
    actorUserId: string | null,
    tx: PrismaTx = this.prisma,
  ) {
    const company = await tx.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Company not found");

    const transition = STATUS_TRANSITIONS[event];
    if (!transition.from.includes(company.status as CompanyStatus)) {
      throw new BadRequestException(
        `Cannot apply lifecycle event "${event}" to a company in status "${company.status}"`,
      );
    }

    const updated = await tx.company.update({ where: { id: companyId }, data: { status: transition.to } });
    if (transition.to === "SUSPENDED" || transition.to === "ARCHIVED") {
      await tx.refreshToken.updateMany({ where: { user: { companyId }, revokedAt: null }, data: { revokedAt: new Date() } });
    }

    await this.auditLogService.record(
      {
        companyId,
        userId: actorUserId,
        action: event === "SUSPEND" ? "company.suspend" : event === "REACTIVATE" ? "company.reactivate" : `company.lifecycle.${event.toLowerCase()}`,
        entityType: "Company",
        entityId: companyId,
        metadata: { from: company.status, to: transition.to },
      },
      tx,
    );

    // Phase 9 Platform Events — only the two named in the constitution map
    // cleanly onto this state machine's transitions.
    if (transition.to === "ACTIVE") {
      await this.platformEventsService.emit("CompanyActivated", { companyId, entityType: "Company", entityId: companyId });
    } else if (transition.to === "ARCHIVED") {
      await this.platformEventsService.emit("CompanyArchived", { companyId, entityType: "Company", entityId: companyId });
    }

    return updated;
  }

  findById(id: string, tx: PrismaTx = this.prisma) {
    return tx.company.findUnique({ where: { id } });
  }

  findBySlug(slug: string, tx: PrismaTx = this.prisma) {
    return tx.company.findUnique({ where: { slug } });
  }

  async list(pagination: { page: number; pageSize: number }, search?: string) {
    const { page, pageSize } = pagination;
    const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async update(id: string, data: { name?: string; slug?: string; status?: CompanyStatus }, actorUserId?: string) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Company not found");
    const updated = await this.prisma.company.update({ where: { id }, data });
    if (existing.name !== updated.name || existing.slug !== updated.slug || existing.status !== updated.status) {
      await this.auditLogService.record({ companyId: id, userId: actorUserId ?? null, action: "company.update", entityType: "Company", entityId: id, metadata: { before: { name: existing.name, slug: existing.slug, status: existing.status }, after: { name: updated.name, slug: updated.slug, status: updated.status } } });
    }
    await this.platformEventsService.emit("CompanyUpdated", { companyId: id, entityType: "Company", entityId: id });
    return updated;
  }

  // --- Company Profile (Phase 2) ---

  async getProfile(companyId: string) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { companyId } });
    if (profile) return toPublicProfile(profile, this.appConfig);
    // Companies provisioned before Phase 2 (or any edge case where the
    // profile row is missing) get one lazily rather than erroring — keeps
    // this endpoint safe to call for every existing company.
    return toPublicProfile(await this.prisma.companyProfile.create({ data: { companyId } }), this.appConfig);
  }

  async updateProfile(
    companyId: string,
    data: Partial<{
      logoUrl: string | null;
      country: string | null;
      city: string | null;
      timeZone: string | null;
      currency: string | null;
      defaultLanguage: string | null;
      fiscalYearStart: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      discoveryProvider: DiscoveryProvider;
      // WRITE-ONLY plain credential from the request, for whichever provider
      // ends up selected (the one in this same update if provided, else the
      // company's currently-stored provider). "" clears that provider's
      // stored credential. Persisted only inside discoveryCredentialsEncrypted
      // — never as a provider-named column.
      discoveryApiKey: string;
    }>,
  ) {
    const { discoveryApiKey, ...rest } = data;
    const persisted: typeof rest & { discoveryCredentialsEncrypted?: string | null } = { ...rest };
    if (discoveryApiKey !== undefined) {
      const existing = await this.prisma.companyProfile.findUnique({ where: { companyId } });
      const providerId = data.discoveryProvider ?? existing?.discoveryProvider ?? "OSM";
      persisted.discoveryCredentialsEncrypted = writeDiscoveryCredentials(
        this.appConfig,
        existing?.discoveryCredentialsEncrypted ?? null,
        providerId,
        discoveryApiKey === "" ? null : { apiKey: discoveryApiKey },
      );
    }
    const updated = await this.prisma.companyProfile.upsert({
      where: { companyId },
      create: { companyId, ...persisted },
      update: persisted,
    });
    await this.platformEventsService.emit("CompanyUpdated", { companyId, entityType: "CompanyProfile", entityId: updated.id });
    return toPublicProfile(updated, this.appConfig);
  }

  // Branch CRUD (Phase 2's MVP org level) now lives directly in
  // BranchesController as a thin type="BRANCH" facade over the general
  // Organizational Structure engine — see OrgUnitsService (Phase 3).
}
