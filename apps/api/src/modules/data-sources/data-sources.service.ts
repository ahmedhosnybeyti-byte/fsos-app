import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { CreateDataSourceInput, DataSourceStatus, UpdateDataSourceInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";
import { AppConfigService } from "../../common/config";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PlatformEventsService } from "../governance/platform-events.service";
import { DataSourceTypesService } from "./data-source-types.service";
import { encryptCredentials } from "./credential-cipher.util";

// Structural "required fields" used only by testConnection() below — this
// is deliberately NOT a live network dial. Phase 6's scope is definition/
// management only; actually opening a connection to read data is explicitly
// reserved for other FSOS engines / a later phase (Refresh Center per the
// Phase 6 document's own closing note).
const REQUIRED_CONNECTION_FIELDS: Record<string, string[]> = {
  SQL_SERVER: ["host", "database"],
  POSTGRESQL: ["host", "database"],
  MYSQL: ["host", "database"],
  ORACLE: ["host", "database"],
  REST_API: ["baseUrl"],
  ERP_CONNECTOR: ["baseUrl"],
  CLOUD_STORAGE: ["bucket"],
};

function toPublicShape<T extends { credentialsCipher: string | null }>(row: T) {
  const { credentialsCipher, ...rest } = row;
  return { ...rest, hasCredentials: credentialsCipher !== null };
}

// Phase 6 — Data Sources Management. Responsible only for defining and
// managing data source records (name/type/connection metadata/status) —
// no analysis, no business rules, no automatic import, and no operational
// relationships. Uploading/replacing/syncing the underlying data is
// explicitly out of scope here (Phase 7 — Refresh Center).
@Injectable()
export class DataSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSourceTypesService: DataSourceTypesService,
    private readonly platformEventsService: PlatformEventsService,
  ) {}

  async create(companyId: string, dto: CreateDataSourceInput, actorUserId?: string) {
    await this.dataSourceTypesService.getByCode(dto.type);
    if (dto.ownerUserId) await this.requireCompanyUser(companyId, dto.ownerUserId);

    try {
      const row = await this.prisma.dataSource.create({
        data: {
          companyId,
          name: dto.name.trim(),
          type: dto.type,
          description: dto.description?.trim() || null,
          dataCategory: dto.dataCategory?.trim() || null,
          connectionConfig: (dto.connectionConfig as Prisma.InputJsonValue | undefined) ?? undefined,
          authMethod: dto.authMethod ?? null,
          credentialsCipher: dto.credentials
            ? encryptCredentials(this.config.values.jwt.accessSecret, dto.credentials)
            : null,
          ownerUserId: dto.ownerUserId ?? null,
        },
      });

      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "datasource.history.created",
        entityType: "DataSource",
        entityId: row.id,
      });
      await this.platformEventsService.emit("DataSourceRegistered", {
        companyId,
        userId: actorUserId,
        entityType: "DataSource",
        entityId: row.id,
      });

      return toPublicShape(row);
    } catch (err) {
      if (isUniqueConstraintError(err, "name")) {
        throw new ConflictException("A data source with this name already exists");
      }
      throw err;
    }
  }

  async list(companyId: string, filter?: { status?: DataSourceStatus; type?: string }) {
    const rows = await this.prisma.dataSource.findMany({
      where: {
        companyId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.type ? { type: filter.type } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toPublicShape);
  }

  async getOne(companyId: string, id: string) {
    return toPublicShape(await this.requireDataSource(companyId, id));
  }

  async update(companyId: string, id: string, dto: UpdateDataSourceInput, actorUserId?: string) {
    const existing = await this.requireDataSource(companyId, id);
    if (dto.ownerUserId !== undefined && dto.ownerUserId !== null) {
      await this.requireCompanyUser(companyId, dto.ownerUserId);
    }

    const updated = await this.prisma.dataSource.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.dataCategory !== undefined ? { dataCategory: dto.dataCategory } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.connectionConfig !== undefined ? { connectionConfig: dto.connectionConfig as Prisma.InputJsonValue } : {}),
        ...(dto.authMethod !== undefined ? { authMethod: dto.authMethod } : {}),
        ...(dto.credentials !== undefined
          ? { credentialsCipher: encryptCredentials(this.config.values.jwt.accessSecret, dto.credentials) }
          : {}),
        ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
      },
    });

    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "datasource.history.status_changed",
        entityType: "DataSource",
        entityId: id,
        metadata: { from: existing.status, to: updated.status },
      });
    }
    if (dto.connectionConfig !== undefined || dto.credentials !== undefined || dto.authMethod !== undefined) {
      await this.auditLogService.record({
        companyId,
        userId: actorUserId ?? null,
        action: "datasource.history.connection_updated",
        entityType: "DataSource",
        entityId: id,
      });
    }

    return toPublicShape(updated);
  }

  // Explicit delete (unlike Branch/OrgUnit/Employee's soft-archive-only
  // pattern) — the Phase 6 document lists "حذفها" as an in-scope operation.
  // Blocked while actively connected/active to avoid destroying a
  // configuration something else may currently rely on; ARCHIVE first.
  async delete(companyId: string, id: string, actorUserId?: string) {
    const existing = await this.requireDataSource(companyId, id);
    if (existing.status === "ACTIVE" || existing.status === "CONNECTED") {
      throw new BadRequestException("Suspend or archive this data source before deleting it");
    }

    await this.auditLogService.record({
      companyId,
      userId: actorUserId ?? null,
      action: "datasource.history.deleted",
      entityType: "DataSource",
      entityId: id,
    });
    await this.prisma.dataSource.delete({ where: { id } });
  }

  // Structural validation only — checks that the fields a connection of
  // this type would need are present and well-formed. Deliberately does
  // NOT open a real socket/HTTP call to a customer-supplied host: Phase 6's
  // constitution reserves all actual reads for other FSOS engines, and an
  // outbound dial to an arbitrary user-supplied endpoint is exactly the
  // kind of operational capability explicitly deferred to a later phase.
  async testConnection(companyId: string, id: string, actorUserId?: string) {
    const existing = await this.requireDataSource(companyId, id);
    const required = REQUIRED_CONNECTION_FIELDS[existing.type] ?? [];
    const config = (existing.connectionConfig as Record<string, unknown> | null) ?? {};

    const missing = required.filter((field) => config[field] === undefined || config[field] === "");
    const needsCredentials = existing.authMethod && existing.authMethod !== "NONE";
    const success = missing.length === 0 && (!needsCredentials || existing.credentialsCipher !== null);

    const message = success
      ? "الإعدادات مكتملة وصحيحة الشكل"
      : missing.length > 0
        ? `بيانات ناقصة: ${missing.join(", ")}`
        : "بيانات الاعتماد مطلوبة ولسه متوفّرتش";

    const testedAt = new Date();
    await this.prisma.dataSource.update({
      where: { id },
      data: { lastTestedAt: testedAt, lastTestResult: success ? "SUCCESS" : "FAILED" },
    });
    await this.auditLogService.record({
      companyId,
      userId: actorUserId ?? null,
      action: "datasource.history.connection_tested",
      entityType: "DataSource",
      entityId: id,
      metadata: { success },
    });

    return { success, message, testedAt };
  }

  // Phase 7/8 additive accessor — exposes the already-existing lookup to the
  // new Data Source Platform / Refresh Platform modules (which need the raw
  // row incl. `credentialsCipher`/`connectionConfig`, unlike the public REST
  // surface above). No existing method's behavior changes.
  async requireRaw(companyId: string, id: string) {
    return this.requireDataSource(companyId, id);
  }

  private async requireDataSource(companyId: string, id: string) {
    const row = await this.prisma.dataSource.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException("Data source not found");
    return row;
  }

  private async requireCompanyUser(companyId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.companyId !== companyId) {
      throw new ForbiddenException("The owner must belong to the same company");
    }
    return user;
  }
}
