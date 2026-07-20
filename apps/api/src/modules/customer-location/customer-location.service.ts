import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@field-sales-os/database";
import type { CaptureCustomerLocationInput, CustomerLocationRecord } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

// Reuses the generic AiReport table (see analysis-event.service.ts /
// sgi.service.ts for the same pattern) instead of a new Prisma model — no
// migration needed. content holds exactly one captured coordinate per row;
// re-capturing the same customerCode just adds another row (the export step
// takes the latest one per customer), so a rep can correct a bad GPS fix by
// simply capturing again rather than needing an edit/delete flow.
const REPORT_TYPE = "customer_location_capture";

interface CapturedContent {
  customerCode: string;
  customerName: string | null;
  lat: number;
  lon: number;
}

@Injectable()
export class CustomerLocationService {
  constructor(private readonly prisma: PrismaService) {}

  async capture(user: AuthenticatedUser, input: CaptureCustomerLocationInput) {
    if (!user.companyId) throw new ForbiddenException();

    const content: CapturedContent = {
      customerCode: input.customerCode,
      customerName: input.customerName ?? null,
      lat: input.lat,
      lon: input.lon,
    };

    return this.prisma.aiReport.create({
      data: {
        companyId: user.companyId,
        userId: user.userId,
        reportType: REPORT_TYPE,
        content: content as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // COMPANY_ADMIN/MANAGER export view — the latest captured coordinate per
  // customerCode (case-insensitive), across every rep. Re-captures for the
  // same customer are expected (a rep correcting a bad GPS fix), so this
  // dedupes to "most recent wins" rather than returning every historical
  // capture.
  async listLatestPerCustomer(user: AuthenticatedUser): Promise<CustomerLocationRecord[]> {
    if (!user.companyId) throw new ForbiddenException();

    const [rows, users] = await Promise.all([
      this.prisma.aiReport.findMany({
        where: { companyId: user.companyId, reportType: REPORT_TYPE },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.findMany({ where: { companyId: user.companyId }, select: { id: true, fullName: true } }),
    ]);

    const nameByUserId = new Map(users.map((u) => [u.id, u.fullName]));
    const latestByCode = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const content = row.content as unknown as CapturedContent;
      const key = content.customerCode.trim().toLowerCase();
      // rows are already newest-first, so the first one seen per key is the
      // latest — skip any older duplicate for the same customer.
      if (!latestByCode.has(key)) latestByCode.set(key, row);
    }

    return Array.from(latestByCode.values())
      .map((row): CustomerLocationRecord => {
        const content = row.content as unknown as CapturedContent;
        return {
          id: row.id,
          customerCode: content.customerCode,
          customerName: content.customerName,
          lat: content.lat,
          lon: content.lon,
          capturedByUserId: row.userId ?? "",
          capturedByName: (row.userId && nameByUserId.get(row.userId)) || "—",
          capturedAt: row.createdAt.toISOString(),
        };
      })
      .sort((a, b) => a.customerCode.localeCompare(b.customerCode, "ar"));
  }
}
