export function canSubmitCompanyDetails(isPending: boolean): boolean {
  return !isPending;
}

export function getCompanyDetailsViewState(input: { isLoading: boolean; isError: boolean; hasData: boolean }): "loading" | "error" | "ready" {
  if (input.isLoading) return "loading";
  if (input.isError || !input.hasData) return "error";
  return "ready";
}