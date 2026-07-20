import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDataSourceTypeInput } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";

// Phase 6: Data Source Type Registry — platform-global metadata (which
// source types exist: Excel, CSV, SQL Server, PostgreSQL, MySQL, Oracle,
// REST API, ERP Connector, Cloud Storage, ...). Adding a new type is a data
// insert here, never a schema/code change — same pattern as Phase 3's
// Organizational Type Registry. Carries no connection logic itself.
@Injectable()
export class DataSourceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.dataSourceType.findMany({ orderBy: { createdAt: "asc" } });
  }

  async getByCode(typeCode: string) {
    const typeDef = await this.prisma.dataSourceType.findUnique({ where: { typeCode } });
    if (!typeDef) {
      throw new NotFoundException(`Unknown data source type "${typeCode}" — it must exist in the type registry first`);
    }
    return typeDef;
  }

  async create(data: CreateDataSourceTypeInput) {
    try {
      return await this.prisma.dataSourceType.create({
        data: {
          typeCode: data.typeCode.trim().toUpperCase(),
          name: data.name.trim(),
          description: data.description?.trim() || null,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException("A data source type with this code already exists");
      }
      throw err;
    }
  }
}
