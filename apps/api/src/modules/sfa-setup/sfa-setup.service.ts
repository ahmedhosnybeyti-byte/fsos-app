import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createWarehouseSchema, updateWarehouseSchema, warehouseBranchesSchema, warehouseListQuerySchema, type CompanySetupChecklist } from "@field-sales-os/schemas";
import { Prisma } from "@field-sales-os/database";
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

  async setBranches(companyId: string, warehouseId: string, input: unknown, userId: string) {
    const {branchIds}=warehouseBranchesSchema.parse(input);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('lock_timeout','5s',true),set_config('statement_timeout','10s',true)`;
      const mode=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT company_id AS id FROM company_operating_settings
        WHERE company_id=${companyId} AND operating_mode='FULL_ERP' FOR SHARE`);
      if(!mode.length)throw new ForbiddenException("FULL_ERP warehouse branch configuration required");
      // Serialize configuration and request admission on the existing warehouse.
      const warehouse=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM warehouses
        WHERE company_id=${companyId} AND id=${warehouseId} AND is_active FOR UPDATE`);
      if(!warehouse.length)throw new NotFoundException("Warehouse not found");
      if(branchIds.length){
        const branches=await tx.$queryRaw<{branchId:string}[]>(Prisma.sql`SELECT btrim(COALESCE(data->>'BranchID','')) AS "branchId"
          FROM rie_canonical_entity_rows WHERE company_id=${companyId} AND entity_name='Branches'
          AND btrim(COALESCE(data->>'BranchID','')) IN (${Prisma.join(branchIds)})
          AND lower(btrim(COALESCE(data->>'Status','')))='active' FOR SHARE`);
        if(branches.length!==branchIds.length||new Set(branches.map(b=>b.branchId)).size!==branchIds.length)
          throw new NotFoundException("Active company branch IDs not found or ambiguous");
      }
      await tx.$executeRaw(Prisma.sql`DELETE FROM wms_warehouse_branches WHERE company_id=${companyId} AND warehouse_id=${warehouseId}`);
      if(branchIds.length)await tx.$executeRaw(Prisma.sql`INSERT INTO wms_warehouse_branches(company_id,warehouse_id,branch_id)
        VALUES ${Prisma.join(branchIds.map(branch=>Prisma.sql`(${companyId},${warehouseId},${branch})`))}`);
      await this.auditLog.record({companyId,userId,action:"warehouse.branches.updated",entityType:"Warehouse",entityId:warehouseId,metadata:{branchIds}},tx);
      return {warehouseId,branchIds};
    },{maxWait:5000,timeout:15000});
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
