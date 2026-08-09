import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, UserActivityActorType, UserActivityOutcome } from "@field-sales-os/database";
import { PrismaService } from "../../common/prisma";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const ALLOWED_TYPES = new Set([
  "AUTH_LOGIN_SUCCESS", "AUTH_LOGIN_FAILED", "AUTH_LOGOUT", "AUTH_SESSION_EXPIRED", "AUTH_PERMISSION_DENIED", "GPT_LAUNCH_CODE_CREATED", "GPT_LAUNCH_CODE_CONSUMED", "GPT_LAUNCH_CODE_REJECTED",
  "BIZ_FILE_UPLOAD", "BIZ_ANALYTICS_REQUEST", "BIZ_360_VIEW", "BIZ_VISIT_COPILOT_OPENED", "BIZ_TASK_CREATE", "BIZ_TASK_STATUS_CHANGE", "BIZ_REPORT_EXPORT", "BIZ_ENTITY_UPDATE",
  "ADMIN_USER_CREATE", "ADMIN_USER_STATUS_CHANGE", "ADMIN_ROLE_CHANGE", "ADMIN_PERMISSION_CHANGE", "ADMIN_ORG_ASSIGNMENT_CHANGE", "ADMIN_COMPANY_MODIFY", "ADMIN_SETTINGS_CHANGE", "ADMIN_GPT_QUOTA_RESET", "ADMIN_EXCEL_LIMIT_CHANGE",
  "SEC_CROSS_COMPANY_ATTEMPT", "SEC_ADMIN_ENDPOINT_UNAUTHORIZED", "SEC_ID_ENUMERATION", "SEC_EXCESSIVE_FAILURES", "SEC_REPLAY_ATTEMPT", "SEC_RATE_LIMIT_ABUSE", "SEC_SUSPICIOUS_UPLOAD", "SEC_ANOMALOUS_API_PATTERN", "SEC_ABNORMAL_EXPORT_PATTERN", "SEC_RISK_LEVEL_CHANGED",
]);
const FORBIDDEN_METADATA = /password|token|cookie|authorization|secret|requestbody|filecontent|conversation/i;
const retentionDays = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
// Defaults are safe for existing deployments; environment overrides allow a
// company-wide retention policy without a migration or a second config model.
export const USER_ACTIVITY_RETENTION_DAYS = {
  accessBusiness: retentionDays("USER_ACTIVITY_ACCESS_BUSINESS_RETENTION_DAYS", 180),
  admin: retentionDays("USER_ACTIVITY_ADMIN_RETENTION_DAYS", 365),
  securityAlerts: retentionDays("USER_ACTIVITY_SECURITY_RETENTION_DAYS", 365),
  dailySummaries: retentionDays("USER_ACTIVITY_SUMMARY_RETENTION_DAYS", 365),
} as const;

export interface ActivityInput {
  type: string; category: "ACCESS" | "BUSINESS" | "ADMIN" | "SECURITY"; actorType?: UserActivityActorType;
  actorUserId?: string | null; subjectUserId?: string | null; actorRole?: string | null; companyId?: string | null;
  branchId?: string | null; targetType?: string | null; targetId?: string | null; outcome?: UserActivityOutcome;
  source: string; sessionId?: string | null; requestId?: string | null; ipAddress?: string | null; userAgent?: string | null; metadata?: Record<string, unknown>;
}

@Injectable()
export class UserActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: ActivityInput) {
    if (!ALLOWED_TYPES.has(input.type)) throw new Error(`Unknown User Activity event: ${input.type}`);
    const subjectUserId = input.subjectUserId ?? input.actorUserId ?? null;
    const subject = subjectUserId ? await this.prisma.user.findUnique({ where: { id: subjectUserId }, include: { orgUnit: true } }) : null;
    const metadata = this.sanitizeMetadata(input.metadata);
    return this.prisma.userActivityEvent.create({ data: {
      eventVersion: 1, category: input.category, type: input.type, actorType: input.actorType ?? (input.actorUserId ? "USER" : "SYSTEM"),
      actorUserId: input.actorUserId ?? null, subjectUserId, actorRole: input.actorRole ?? null,
      companyId: input.companyId ?? subject?.companyId ?? null, branchId: input.branchId ?? subject?.orgUnitId ?? null,
      orgPath: subject?.orgUnit ? { orgUnitId: subject.orgUnit.id, path: subject.orgUnit.path, type: subject.orgUnit.type, name: subject.orgUnit.name } : Prisma.JsonNull,
      targetType: input.targetType ?? null, targetId: input.targetId ?? null, outcome: input.outcome ?? "SUCCESS", source: input.source,
      sessionId: input.sessionId ?? null, requestId: input.requestId ?? null, ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null,
      metadata: metadata ?? Prisma.JsonNull,
    }});
  }

  async timeline(viewer: AuthenticatedUser, subjectUserId: string, from?: string, to?: string, category?: string) {
    await this.assertVisible(viewer, subjectUserId);
    const timestamp: Prisma.DateTimeFilter = {};
    if (from) timestamp.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) timestamp.lte = new Date(`${to}T23:59:59.999Z`);
    const where: Prisma.UserActivityEventWhereInput = { subjectUserId, ...(from || to ? { timestamp } : {}), ...(category ? { category } : {}) };
    const isSuperAdmin = viewer.roleCode === "SUPER_ADMIN";
    const [items, totalEvents, businessEvents, deniedEvents, securityAlerts, risk] = await Promise.all([
      this.prisma.userActivityEvent.findMany({ where, orderBy: { timestamp: "desc" }, take: 500 }),
      this.prisma.userActivityEvent.count({ where }), this.prisma.userActivityEvent.count({ where: { ...where, category: "BUSINESS" } }),
      this.prisma.userActivityEvent.count({ where: { ...where, outcome: "DENIED" } }),
      isSuperAdmin ? this.prisma.userActivitySecurityAlert.count({ where: { subjectUserId } }) : Promise.resolve(0), isSuperAdmin ? this.prisma.userRiskState.findUnique({ where: { userId: subjectUserId } }) : Promise.resolve(null),
    ]);
    return { items: isSuperAdmin ? items : items.filter(item => item.category !== "SECURITY"), summary: { totalEvents, businessEvents, deniedEvents, securityAlerts: isSuperAdmin ? securityAlerts : undefined, riskLevel: isSuperAdmin ? (risk?.level ?? "NORMAL") : undefined } };
  }

  async search(viewer: AuthenticatedUser, q: string) {
    const scope = await this.visibleUserIds(viewer);
    return this.prisma.user.findMany({ where: { id: { in: scope }, OR: [{ fullName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }, include: { company: true, orgUnit: true, role: true }, take: 50 });
  }
  async tree(viewer: AuthenticatedUser) {
    const ids = await this.visibleUserIds(viewer);
    return this.prisma.user.findMany({ where: { id: { in: ids } }, include: { company: true, orgUnit: true, role: true, employee: { select: { managerId: true } } }, orderBy: [{ companyId: "asc" }, { fullName: "asc" }] });
  }
  private sanitizeMetadata(metadata?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    if (!metadata) return undefined;
    return Object.fromEntries(Object.entries(metadata).filter(([key]) => !FORBIDDEN_METADATA.test(key))) as Prisma.InputJsonValue;
  }
  async recalculateDailySummary(companyId: string, activityDate: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: { profile: { select: { timeZone: true } } } });
    if (!company) return 0;
    const { from, to } = this.companyDayBounds(activityDate, company.profile?.timeZone ?? "UTC");
    const events = await this.prisma.userActivityEvent.findMany({ where: { companyId, timestamp: { gte: from, lt: to }, subjectUserId: { not: null } }, select: { subjectUserId: true, category: true, outcome: true } });
    const alerts = await this.prisma.userActivitySecurityAlert.findMany({ where: { companyId, createdAt: { gte: from, lt: to }, subjectUserId: { not: null } }, select: { subjectUserId: true } });
    const byUser = new Map<string, { totalEvents: number; businessEvents: number; deniedEvents: number; securityAlerts: number }>();
    for (const event of events) { const id = event.subjectUserId!; const row = byUser.get(id) ?? { totalEvents: 0, businessEvents: 0, deniedEvents: 0, securityAlerts: 0 }; row.totalEvents++; if (event.category === "BUSINESS") row.businessEvents++; if (event.outcome === "DENIED") row.deniedEvents++; byUser.set(id, row); }
    for (const alert of alerts) { const id = alert.subjectUserId!; const row = byUser.get(id) ?? { totalEvents: 0, businessEvents: 0, deniedEvents: 0, securityAlerts: 0 }; row.securityAlerts++; byUser.set(id, row); }
    const date = new Date(`${activityDate}T00:00:00.000Z`);
    await this.prisma.$transaction([...byUser.entries()].map(([userId, data]) => this.prisma.userActivityDailySummary.upsert({ where: { userId_activityDate: { userId, activityDate: date } }, create: { userId, companyId, activityDate: date, ...data }, update: data })));
    return byUser.size;
  }
  async recalculateDailySummaries(activityDate: string) { const companies = await this.prisma.company.findMany({ select: { id: true } }); return Promise.all(companies.map(c => this.recalculateDailySummary(c.id, activityDate))); }
  async cleanupRetention(now = new Date()) {
    const cutoff = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const [alerts, raw, summaries] = await this.prisma.$transaction([
      this.prisma.userActivitySecurityAlert.deleteMany({ where: { createdAt: { lt: cutoff(USER_ACTIVITY_RETENTION_DAYS.securityAlerts) } } }),
      this.prisma.userActivityEvent.deleteMany({ where: { OR: [{ category: { in: ["ACCESS", "BUSINESS"] }, timestamp: { lt: cutoff(USER_ACTIVITY_RETENTION_DAYS.accessBusiness) } }, { category: "ADMIN", timestamp: { lt: cutoff(USER_ACTIVITY_RETENTION_DAYS.admin) } }, { category: "SECURITY", timestamp: { lt: cutoff(USER_ACTIVITY_RETENTION_DAYS.securityAlerts) } }] } }),
      this.prisma.userActivityDailySummary.deleteMany({ where: { activityDate: { lt: cutoff(USER_ACTIVITY_RETENTION_DAYS.dailySummaries) } } }),
    ]);
    return { rawEvents: raw.count, alerts: alerts.count, summaries: summaries.count };
  }
  private companyDayBounds(date: string, timeZone: string) {
    const [year, month, day] = date.split("-").map(Number); const target = Date.UTC(year!, month! - 1, day!);
    const offset = (instant: number) => { const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).formatToParts(new Date(instant)); const get = (type: string) => Number(parts.find(p => p.type === type)?.value); return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - instant; };
    let fromMs = target - offset(target); fromMs = target - offset(fromMs); let toMs = target + 86_400_000 - offset(target + 86_400_000); toMs = target + 86_400_000 - offset(toMs);
    return { from: new Date(fromMs), to: new Date(toMs) };
  }
  private async assertVisible(viewer: AuthenticatedUser, userId: string) {
    if (!(await this.visibleUserIds(viewer)).includes(userId)) throw new ForbiddenException("User is outside your organizational scope");
  }
  private async visibleUserIds(viewer: AuthenticatedUser): Promise<string[]> {
    if (viewer.roleCode === "SUPER_ADMIN") return (await this.prisma.user.findMany({ select: { id: true } })).map(x => x.id);
    if (!viewer.companyId) return [];
    const users = await this.prisma.user.findMany({ where: { companyId: viewer.companyId }, include: { employee: { select: { id: true, managerId: true } } } });
    if (viewer.roleCode === "COMPANY_ADMIN") return users.map(x => x.id);
    const me = users.find(x => x.id === viewer.userId)?.employee;
    if (!me) return [viewer.userId];
    const children = new Map<string, string[]>();
    for (const u of users) if (u.employee?.managerId) children.set(u.employee.managerId, [...(children.get(u.employee.managerId) ?? []), u.id]);
    const visible = new Set<string>([viewer.userId]); const queue = [me.id];
    while (queue.length) for (const id of children.get(queue.shift()!) ?? []) { if (!visible.has(id)) { visible.add(id); const emp = users.find(u => u.id === id)?.employee; if (emp) queue.push(emp.id); } }
    return [...visible];
  }
}
