import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSchemaDefinitionInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";

// Phase 7 — Basic Schema Registry. The official, platform-global reference
// for FSOS's approved operational entity structure. Deliberately "basic" per
// the constitution's own MVP scope: entityName + optional column hints, no
// strict enforcement yet. New entity types are data inserts here, same
// reuse-before-rewrite pattern as OrgUnitTypeDefinition / DataSourceType.
@Injectable()
export class SchemaRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.schemaDefinition.findMany({ orderBy: { entityName: "asc" } });
  }

  async getByEntityName(entityName: string) {
    const row = await this.prisma.schemaDefinition.findUnique({ where: { entityName } });
    if (!row) throw new NotFoundException(`No schema definition registered for "${entityName}"`);
    return row;
  }

  async findByEntityName(entityName: string) {
    return this.prisma.schemaDefinition.findUnique({ where: { entityName } });
  }

  async create(dto: CreateSchemaDefinitionInput) {
    try {
      return await this.prisma.schemaDefinition.create({
        data: {
          entityName: dto.entityName.trim().toUpperCase(),
          description: dto.description?.trim() || null,
          expectedColumns: dto.expectedColumns ?? undefined,
          isSystem: false,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "entityName")) {
        throw new ConflictException("A schema definition for this entity already exists");
      }
      throw err;
    }
  }
}
