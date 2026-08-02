import type { SgiRepDirectoryEntry, SgiRepStats } from "@/lib/types";

export type SgiKpiRole = "SALES_REP" | "SUPERVISOR" | "COMPANY_ADMIN" | "MANAGER" | string;

export type SgiRepStatsSelection =
  | { state: "ready"; salesActual: number; activeCustomers: number; repCount: number }
  | { state: "missing-current-user-email" | "empty-team" | "no-rep-stats" };

interface SelectSgiRepStatsInput {
  roleCode: SgiKpiRole;
  currentUserEmail?: string | null;
  repDirectory: SgiRepDirectoryEntry[];
  repStats: Record<string, SgiRepStats>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sumRepStats(entries: SgiRepStats[]): SgiRepStatsSelection {
  if (entries.length === 0) return { state: "no-rep-stats" };
  return {
    state: "ready",
    salesActual: entries.reduce((sum, entry) => sum + entry.salesActual, 0),
    activeCustomers: entries.reduce((sum, entry) => sum + entry.activeCustomers, 0),
    repCount: entries.length,
  };
}

/**
 * Selects only the rep statistics that the current Sales Growth view is
 * permitted to summarize. The API has already applied its visibility scope;
 * the client further selects the current rep or their listed direct team.
 */
export function selectSgiRepStats({ roleCode, currentUserEmail, repDirectory, repStats }: SelectSgiRepStatsInput): SgiRepStatsSelection {
  const statsByEmail = new Map(Object.entries(repStats).map(([email, stats]) => [normalizeEmail(email), stats]));

  if (roleCode === "SALES_REP") {
    if (!currentUserEmail?.trim()) return { state: "missing-current-user-email" };
    return sumRepStats([statsByEmail.get(normalizeEmail(currentUserEmail))].filter((entry): entry is SgiRepStats => entry !== undefined));
  }

  if (roleCode === "SUPERVISOR") {
    if (!currentUserEmail?.trim()) return { state: "missing-current-user-email" };
    const supervisorEmail = normalizeEmail(currentUserEmail);
    const teamEmails = new Set(
      repDirectory.filter((rep) => rep.supervisorEmail !== null && normalizeEmail(rep.supervisorEmail) === supervisorEmail).map((rep) => normalizeEmail(rep.email)),
    );
    if (teamEmails.size === 0) return { state: "empty-team" };
    return sumRepStats(Array.from(teamEmails).map((email) => statsByEmail.get(email)).filter((entry): entry is SgiRepStats => entry !== undefined));
  }

  if (roleCode === "COMPANY_ADMIN" || roleCode === "MANAGER") {
    return sumRepStats(Array.from(statsByEmail.values()));
  }

  return { state: "no-rep-stats" };
}
