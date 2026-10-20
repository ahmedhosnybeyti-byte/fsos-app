import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createWarehouseSchema, updateWarehouseSchema, warehouseListQuerySchema, type CompanySetupChecklist } from "@field-sales-os/schemas";
import { PrismaService, isUniqueConstraintError } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";

const warehouseSelect = { id: true, code: true, name: true, address: true, isActive: true } as const;

@Injectable()
export class SfaSetupService {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}

  async checklist(companyId: string): Promise<CompanySetupChecklist> {
    // Indexed existence probes, not roster/fact loads. No canonical or Excel dependency.
    const [employee, warehouse, product, opening] = await Promise.all([
      this.prisma.employee.findFirst({ where: { companyId, status: "ACTIVE" }, select: { id: true } }),
      this.prisma.warehouse.findFirst({ where: { companyId, isActive: true }, select: { id: true } }),
      this.prisma.wmsProduct.findFirst({ where: { companyId, isActive: true }, select: { id: true } }),
      this.prisma.wmsMovement.findFirst({ where: { companyId, kind: "OPENING", reversedBy: { none: {} } }, select: { id: true } }),
    ]);
    return { items: [
      { key: "products", status: product ? "PRESENT" : "MISSING" },
      { key: "customers", status: "NOT_AVAILABLE" },
      { key: "prices", status: "NOT_AVAILABLE" },
      { key: "employees", status: employee ? "PRESENT" : "MISSING" },
      { key: "warehouses", status: warehouse ? "PRESENT" : "MISSING" },
      { key: "openingBalances", status: opening ? "PRESENT" : "MISSING" },
    ] };
  }

  async list(companyId: string, input: unknown) {
    const { page, pageSize, search } = warehouseListQuerySchema.parse(input);
    const rows = await this.prisma.warehouse.findMany({
      where: { companyId, ...(search ? { OR: [
        { code: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ] } : {}) },
      select: warehouseSelect, orderBy: { id: "asc" }, skip: (page - 1) * pageSize, take: pageSize + 1,
    });
    return { items: rows.slice(0, pageSize), page, pageSize, hasMore: rows.length > pageSize };
  }

  async get(companyId: string, id: string) {
    const row = await this.prisma.warehouse.findFirst({ where: { companyId, id }, select: warehouseSelect });
    if (!row) throw new NotFoundException("Warehouse not found");
    return row;
  }

  async create(companyId: string, input: unknown, userId: string) {
    const data = createWarehouseSchema.parse(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.warehouse.create({ data: { ...data, companyId }, select: warehouseSelect });
        await this.auditLog.record({ companyId, userId, action: "warehouse.created", entityType: "Warehouse", entityId: row.id }, tx);
        return row;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException("Warehouse code already exists in your company");
      throw error;
    }
  }

  async update(companyId: string, id: string, input: unknown, userId: string) {
    const data = updateWarehouseSchema.parse(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Company is part of the mutation predicate, not just a preceding lookup.
        const result = await tx.warehouse.updateMany({ where: { companyId, id }, data });
        if (result.count !== 1) throw new NotFoundException("Warehouse not found");
        const row = await tx.warehouse.findFirstOrThrow({ where: { companyId, id }, select: warehouseSelect });
        await this.auditLog.record({ companyId, userId, action: "warehouse.updated", entityType: "Warehouse", entityId: row.id }, tx);
        return row;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException("Warehouse code already exists in your company");
      throw error;
    }
  }
}
