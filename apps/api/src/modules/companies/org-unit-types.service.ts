import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateOrgUnitTypeDefinitionInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";

// "ROOT" is a reserved sentinel (not a real registry row) meaning "may sit
// directly under the Company" — i.e. parentId = null.
export const ORG_UNIT_ROOT_MARKER = "ROOT";

// Phase 3: Organizational Type Registry. Pure metadata — what unit types
// exist (Branch, Region, Distribution Center, Route, ...) and how they may
// nest. Deliberately carries NO business logic, permissions, reporting
// rules, or employee/customer/route linkage; that is exclusively the
// Relationship Intelligence Engine's domain, which will consume this
// registry later but is never implemented inside Company Management.
@Injectable()
export class OrgUnitTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.orgUnitTypeDefinition.findMany({ orderBy: { createdAt: "asc" } });
  }

  async getByCode(typeCode: string) {
    const typeDef = await this.prisma.orgUnitTypeDefinition.findUnique({ where: { typeCode } });
    if (!typeDef) {
      throw new NotFoundException(`Unknown organizational unit type "${typeCode}" — it must exist in the type registry first`);
    }
    return typeDef;
  }

  async create(data: CreateOrgUnitTypeDefinitionInput) {
    try {
      return await this.prisma.orgUnitTypeDefinition.create({
        data: {
          typeCode: data.typeCode.trim().toUpperCase(),
          name: data.name.trim(),
          description: data.description?.trim() || null,
          allowedParentCodes: data.allowedParentCodes,
          allowedChildCodes: data.allowedChildCodes,
        },
      });
    } catch (err) {
      // Single unique constraint on this table (typeCode) — no field filter
      // needed, and avoids guessing whether Prisma reports the client field
      // name or the mapped DB column name for the P2002 target.
      if (isUniqueConstraintError(err)) {
        throw new ConflictException("An organizational unit type with this code already exists");
      }
      throw err;
    }
  }

  // Validates that `childType` is allowed to sit under `parentTypeCode`
  // (null = directly under the Company) per the registry's Parent
  // Types / Allowed Children columns. This is a structural nesting check
  // only — not a business rule, not a permission check.
  async validateNesting(childType: { typeCode: string; allowedParentCodes: string[] }, parentTypeCode: string | null) {
    const parentMarker = parentTypeCode ?? ORG_UNIT_ROOT_MARKER;
    if (!childType.allowedParentCodes.includes(parentMarker)) {
      throw new BadRequestException(
        `Organizational unit type "${childType.typeCode}" is not allowed under "${parentMarker}"`,
      );
    }
    if (parentTypeCode) {
      const parentType = await this.getByCode(parentTypeCode);
      if (!parentType.allowedChildCodes.includes(childType.typeCode)) {
        throw new BadRequestException(
          `Organizational unit type "${parentType.typeCode}" does not allow children of type "${childType.typeCode}"`,
        );
      }
    }
  }
}
