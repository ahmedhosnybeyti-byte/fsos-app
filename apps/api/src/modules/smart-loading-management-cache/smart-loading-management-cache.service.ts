import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "@field-sales-os/database";
import { PrismaService, type PrismaTx } from "../../common/prisma";

export type ManagementRiskSnapshotInput = Readonly<{
  companyId: string;
  targetDate: string;
  salesFrom: string;
  salesTo: string;
  personLevel: string;
  routeIds: readonly string[] | null;
}>;

const SOURCE_ENTITIES = new Set(["Van Inventory", "Invoices", "Invoice Items", "Routes", "Employees", "Products"]);

@Injectable()
export class SmartLoadingManagementCacheService {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly prisma: PrismaService) {}

  async getOrCompute<T>(input: ManagementRiskSnapshotInput, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const key = this.snapshotKey(input);
    const existing = await this.prisma.smartLoadingManagementLoadingRiskSnapshot.findUnique({ where: { companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey: key }, select: { result: true } });
    if (existing) return { value: existing.result as T, hit: true };

    const active = this.inFlight.get(this.inFlightKey(key));
    if (active) return { value: await active as T, hit: true };

    const created = compute().then(async (value) => {
      await this.prisma.smartLoadingManagementLoadingRiskSnapshot.upsert({
        where: { companyId_targetDate_salesFrom_salesTo_personLevel_scopeKey: key },
        create: { ...key, scopeIsCompanyWide: input.routeIds === null, routeIds: this.normalizedRouteIds(input.routeIds), result: value as Prisma.InputJsonValue },
        update: { result: value as Prisma.InputJsonValue, scopeIsCompanyWide: input.routeIds === null, routeIds: this.normalizedRouteIds(input.routeIds) },
      });
      return value;
    }).finally(() => this.inFlight.delete(this.inFlightKey(key)));
    this.inFlight.set(this.inFlightKey(key), created);
    return { value: await created, hit: false };
  }

  /** Called only after PostgreSQL reports an actual canonical-row change. */
  async invalidateForCanonicalChange(tx: PrismaTx, companyId: string, entityName: string, routeIds: readonly string[] = [], routeScopeKnown = false): Promise<void> {
    if (!SOURCE_ENTITIES.has(entityName)) return;
    const normalized = this.normalizedRouteIds(routeIds);
    // Route changes, product/master-data changes, and invoice-line changes can
    // alter scopes outside the changed row. They deliberately invalidate only
    // this company, never another tenant. Van Inventory carries an immutable
    // RouteID in its canonical key, so its known routes can be targeted.
    if (entityName !== "Van Inventory" || !routeScopeKnown || normalized.length === 0) {
      await tx.smartLoadingManagementLoadingRiskSnapshot.deleteMany({ where: { companyId } });
      return;
    }
    await tx.smartLoadingManagementLoadingRiskSnapshot.deleteMany({
      where: { companyId, OR: [{ scopeIsCompanyWide: true }, { routeIds: { hasSome: normalized } }] },
    });
  }

  private snapshotKey(input: ManagementRiskSnapshotInput) {
    return {
      companyId: input.companyId,
      targetDate: input.targetDate,
      salesFrom: input.salesFrom,
      salesTo: input.salesTo,
      personLevel: input.personLevel,
      scopeKey: createHash("sha256").update(input.routeIds === null ? "company-wide" : this.normalizedRouteIds(input.routeIds).join("\u0000")).digest("hex"),
    };
  }

  private inFlightKey(key: ReturnType<SmartLoadingManagementCacheService["snapshotKey"]>) {
    return `${key.companyId}:${key.targetDate}:${key.salesFrom}:${key.salesTo}:${key.personLevel}:${key.scopeKey}`;
  }

  private normalizedRouteIds(routeIds: readonly string[] | null): string[] {
    return [...new Set((routeIds ?? []).map((routeId) => routeId.trim().toLowerCase()).filter(Boolean))].sort();
  }
}
