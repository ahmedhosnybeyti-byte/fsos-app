import { ConflictException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { CompanyStatus } from "@field-sales-os/schemas";
import { PrismaService, type PrismaTx, isUniqueConstraintError } from "../../common/prisma";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "company"
  );
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCompany(name: string, tx: PrismaTx = this.prisma) {
    const base = slugify(name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
      try {
        return await tx.company.create({ data: { name, slug } });
      } catch (err) {
        if (isUniqueConstraintError(err, "slug") && attempt < 4) continue;
        throw err;
      }
    }
    throw new ConflictException("Could not generate a unique company identifier");
  }

  findById(id: string, tx: PrismaTx = this.prisma) {
    return tx.company.findUnique({ where: { id } });
  }

  findBySlug(slug: string, tx: PrismaTx = this.prisma) {
    return tx.company.findUnique({ where: { slug } });
  }

  async list(pagination: { page: number; pageSize: number }) {
    const { page, pageSize } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.company.count(),
    ]);
    return { items, total, page, pageSize };
  }

  update(id: string, data: { name?: string; status?: CompanyStatus }) {
    return this.prisma.company.update({ where: { id }, data });
  }
}
