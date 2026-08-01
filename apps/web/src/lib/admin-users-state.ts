export type AdminUsersViewState = "select-company" | "loading" | "error" | "empty" | "no-results" | "ready";

export function getAdminUsersViewState(input: {
  companyId?: string;
  isLoading: boolean;
  isError: boolean;
  total?: number;
  hasFilters: boolean;
}): AdminUsersViewState {
  if (!input.companyId) return "select-company";
  if (input.isLoading) return "loading";
  if (input.isError) return "error";
  if ((input.total ?? 0) > 0) return "ready";
  return input.hasFilters ? "no-results" : "empty";
}

export function canStartUserMutation(isPending: boolean): boolean {
  return !isPending;
}
export function getPageAfterUserFilterChange(): number {
  return 1;
}