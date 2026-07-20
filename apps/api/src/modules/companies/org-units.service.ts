import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateOrgUnitInput, OrgUnitStatus, UpdateOrgUnitInput } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";
import { PlatformEventsService } from "../governance/platform-events.service";
import { OrgUnitTypesService } from "./org-unit-types.service";

// Phase 3: the general Organizational Structure engine. Branch (the only
// unit type actually exposed in the product per the approved MVP scope) is
// just this engine used with type="BRANCH" — see BranchesController, which
// is a thin facade over this service. Scope is strictly structural:
// creating/reading/renaming/moving/archiving organizational units and
// keeping their Organizational Path consistent. No employee, customer,
// route, or any other operational-data linkage happens here — that is
// exclusively the Relationship Intelligence Engine's future responsibility.
@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgUnitTypesService: OrgUnitTypesService,
    private readonly platformEventsService: PlatformEventsService,
  ) {}

  async create(companyId: string, data: CreateOrgUnitInput, tx: PrismaTx = this.prisma) {
    const typeDef = await this.orgUnitTypesService.getByCode(data.type);

    const parent = data.parentId ? await this.requireUnit(tx, companyId, data.parentId) : null;
    await this.orgUnitTypesService.validateNesting(typeDef, parent?.type ?? null);

    const code = data.code.trim();
    const path = parent ? `${parent.path}/${code}` : code;

    try {
      const created = await tx.orgUnit.create({
        data: {
          companyId,
          parentId: parent?.id ?? null,
          type: typeDef.typeCode,
          code,
          name: data.name.trim(),
          path,
        },
      });
      await this.platformEventsService.emit("OrganizationalUnitCreated", {
        companyId,
        entityType: "OrgUnit",
        entityId: created.id,
      });
      return created;
    } catch (err) {
      if (isUniqueConstraintError(err, "code")) {
        throw new ConflictException("An organizational unit with this code already exists for this type");
      }
      throw err;
    }
  }

  // Phase 10 Company Policy: "no Branch without Region." Rather than forcing
  // every caller (BranchesController's simple code+name form, and Company
  // Provisioning) to know about Regions, this lazily finds — or creates —
  // a single default Region per company and returns it, so a Branch always
  // has a valid parent under the new registry rule with zero UI/API change
  // for the existing Branches screen. Idempotent: safe to call on every
  // branch creation.
  async ensureDefaultRegion(companyId: string, tx: PrismaTx = this.prisma) {
    const existing = await tx.orgUnit.findFirst({
      where: { companyId, type: "REGION", status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;

    return this.create(companyId, { type: "REGION", code: "MAIN", name: "المنطقة الرئيسية" }, tx);
  }

  list(companyId: string, filter?: { type?: string; parentId?: string | null }) {
    return this.prisma.orgUnit.findMany({
      where: {
        companyId,
        ...(filter?.type ? { type: filter.type } : {}),
        ...(filter?.parentId !== undefined ? { parentId: filter.parentId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async getOne(companyId: string, id: string, expectedType?: string) {
    return this.requireUnit(this.prisma, companyId, id, expectedType);
  }

  async update(companyId: string, id: string, data: UpdateOrgUnitInput, expectedType?: string) {
    const unit = await this.requireUnit(this.prisma, companyId, id, expectedType);

    if (data.status === "ARCHIVED" && unit.status !== "ARCHIVED") {
      await this.assertNoActiveChildren(id);
    }

    return this.prisma.orgUnit.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.status !== undefined ? { status: data.status as OrgUnitStatus } : {}),
      },
    });
  }

  async archive(companyId: string, id: string, expectedType?: string) {
    await this.requireUnit(this.prisma, companyId, id, expectedType);
    await this.assertNoActiveChildren(id);
    // Organizational units are never hard-deleted — archiving is the only
    // terminal state, preserving referential integrity for anything that
    // may reference them later (RIE, in a future phase).
    return this.prisma.orgUnit.update({ where: { id }, data: { status: "ARCHIVED" } });
  }

  // Move Organizational Unit: re-parents a unit while preserving structural
  // integrity — blocks circular hierarchies, re-validates the new nesting
  // against the type registry, and cascades the Organizational Path
  // recomputation down to every descendant.
  async move(companyId: string, id: string, newParentId: string | null, expectedType?: string) {
    const unit = await this.requireUnit(this.prisma, companyId, id, expectedType);

    if (newParentId === id) {
      throw new BadRequestException("An organizational unit cannot be its own parent");
    }

    let newParentType: string | null = null;
    let newParentPath: string | null = null;

    if (newParentId) {
      const newParent = await this.requireUnit(this.prisma, companyId, newParentId);
      newParentType = newParent.type;
      newParentPath = newParent.path;

      let cursor = newParent;
      while (cursor.parentId) {
        if (cursor.parentId === id) {
          throw new BadRequestException("This move would create a circular organizational hierarchy");
        }
        cursor = await this.prisma.orgUnit.findUniqueOrThrow({ where: { id: cursor.parentId } });
      }
    }

    const typeDef = await this.orgUnitTypesService.getByCode(unit.type);
    await this.orgUnitTypesService.validateNesting(typeDef, newParentType);

    const newPath = newParentPath ? `${newParentPath}/${unit.code}` : unit.code;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.orgUnit.update({ where: { id }, data: { parentId: newParentId, path: newPath } });
      await this.recomputeDescendantPaths(tx, id, newPath);
      return result;
    });

    await this.platformEventsService.emit("OrganizationalUnitMoved", { companyId, entityType: "OrgUnit", entityId: id });
    return updated;
  }

  private async requireUnit(tx: PrismaTx, companyId: string, id: string, expectedType?: string) {
    const unit = await tx.orgUnit.findFirst({ where: { id, companyId } });
    if (!unit || (expectedType && unit.type !== expectedType)) {
      throw new NotFoundException("Organizational unit not found");
    }
    return unit;
  }

  private async assertNoActiveChildren(parentId: string) {
    const activeChildren = await this.prisma.orgUnit.count({
      where: { parentId, status: { not: "ARCHIVED" } },
    });
    if (activeChildren > 0) {
      throw new BadRequestException("Cannot archive an organizational unit that has active child units");
    }
  }

  private async recomputeDescendantPaths(tx: PrismaTx, parentId: string, parentPath: string) {
    const children = await tx.orgUnit.findMany({ where: { parentId } });
    for (const child of children) {
      const childPath = `${parentPath}/${child.code}`;
      await tx.orgUnit.update({ where: { id: child.id }, data: { path: childPath } });
      await this.recomputeDescendantPaths(tx, child.id, childPath);
    }
  }
}
