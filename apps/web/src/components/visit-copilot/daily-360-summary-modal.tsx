"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, FileDown, Package, Quote, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { visitCopilotApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "@/components/translation-provider";
import { useAuth } from "@/hooks/use-auth";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { VisitCopilot360ExecutionStep, VisitCopilotPeriod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { exportDaily360SummaryPdf } from "@/lib/export/daily-360-summary-pdf";
import { daily360SummaryQuery } from "./daily-360-summary-query";
import {
  daily360CategoryKey,
  groupDaily360LostOpportunities,
  toggleDaily360OpenCategory,
  toggleDaily360OpenCustomer,
  daily360AllowedExclusionActions,
  type Daily360ExclusionAction,
} from "./daily-360-opportunity-groups";

// "ملخص اليوم 360°" (2026-07-28) — a full-screen (on mobile) / large modal
// (desktop) report inside Visit Copilot. Visual/structural fidelity to the
// 3 reference ChatGPT screenshots is the acceptance bar (see Task Brief):
// title/scope block, executive summary, top issue, numbered lost-
// opportunity customer cards, risks/collections, a 3-item root-cause list,
// executive decision, a 4-column execution-plan table, and a closing quoted
// phrase. Every number rendered here comes straight from the server DTO —
// this component does zero computation of its own.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: VisitCopilotPeriod;
  selectedDate: string;
  from?: string;
  to?: string;
}

function priorityBadgeClass(priority: VisitCopilot360ExecutionStep["priority"]): string {
  if (priority === "عالية") return "bg-rose-500/15 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300";
  if (priority === "متوسطة") return "bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

export function Daily360SummaryModal({ open, onOpenChange, period, selectedDate, from, to }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [isExportExpanded, setIsExportExpanded] = useState(false);
  const [hasInitializedAccordion, setHasInitializedAccordion] = useState(false);
  const [openCustomerCode, setOpenCustomerCode] = useState<string | null>(null);
  const [openCategoryKeys, setOpenCategoryKeys] = useState<Set<string>>(() => new Set());

  const daily360Query = daily360SummaryQuery({ period, from, to, selectedDate });
  const query = useQuery({
    queryKey: daily360Query.queryKey,
    queryFn: () => visitCopilotApi.daily360Summary(daily360Query.request),
    enabled: open,
    // A rep might tap the button twice while the report is generating —
    // react-query already de-dupes concurrent identical requests, but keep
    // the query disabled from refetching on window focus too (this is a
    // point-in-time report, not a live dashboard).
    refetchOnWindowFocus: false,
  });

  const exclusionsQuery = useQuery({
    queryKey: ["visit-copilot", "lost-opportunity-exclusions"],
    queryFn: visitCopilotApi.lostOpportunityExclusions,
    enabled: open && !!user,
  });
  const revokeExclusionMutation = useMutation({
    mutationFn: visitCopilotApi.revokeLostOpportunityExclusion,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: daily360Query.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["visit-copilot", "lost-opportunity-exclusions"] }),
      ]);
      toast.success(t("copilot.summary360ExclusionRevoked"));
    },
    onError: () => toast.error(t("copilot.summary360ExclusionError")),
  });
  const exclusionMutation = useMutation({
    mutationFn: (input: { scopeType: Daily360ExclusionAction; customerCode: string; productCode: string; reason?: string }) =>
      visitCopilotApi.createLostOpportunityExclusion(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: daily360Query.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["visit-copilot", "lost-opportunity-exclusions"] }),
      ]);
      toast.success(t("copilot.summary360ExclusionSaved"));
    },
    onError: () => toast.error(t("copilot.summary360ExclusionError")),
  });
  const allowedExclusionActions = daily360AllowedExclusionActions(user?.role.code);

  function excludeProduct(scopeType: Daily360ExclusionAction, customerCode: string, productCode: string) {
    const labelKey: Record<Daily360ExclusionAction, TranslationKey> = {
      CUSTOMER_PRODUCT: "copilot.summary360ExcludeCustomerProduct",
      SALESPERSON_PRODUCT: "copilot.summary360ExcludeSalespersonProduct",
      TEAM_PRODUCT: "copilot.summary360ExcludeTeamProduct",
      COMPANY_PRODUCT: "copilot.summary360ExcludeCompanyProduct",
    };
    if (!window.confirm(t("copilot.summary360ExcludeConfirm", { scope: t(labelKey[scopeType]) }))) return;
    const reason = window.prompt(t("copilot.summary360ExcludeReason"));
    if (reason === null) return;
    exclusionMutation.mutate({ scopeType, customerCode, productCode, reason: reason.trim() || undefined });
  }

  const summary = query.data;
  const lostOpportunityGroups = useMemo(
    () => groupDaily360LostOpportunities(summary?.lostOpportunities ?? [], t("copilot.summary360Uncategorized")),
    [summary?.lostOpportunities, t],
  );

  useEffect(() => {
    if (!hasInitializedAccordion && lostOpportunityGroups.length > 0) {
      setOpenCustomerCode(lostOpportunityGroups[0]!.customerCode);
      setHasInitializedAccordion(true);
    }
  }, [hasInitializedAccordion, lostOpportunityGroups]);

  useEffect(() => {
    if (!open) {
      setHasInitializedAccordion(false);
      setOpenCustomerCode(null);
      setOpenCategoryKeys(new Set());
    }
  }, [open]);

  async function handleExportPdf() {
    if (!summary || exporting) return;
    setExporting(true);
    setIsExportExpanded(true);
    try {
      // Let React paint the fully expanded report before html2canvas reads the DOM.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await exportDaily360SummaryPdf(summary, t);
    } catch (err) {
      // 2026-07-28: was a bare `catch {}` swallowing the real error —
      // impossible to diagnose from a bug report alone. Logging the actual
      // exception so the browser Console shows the real cause instead of
      // just the generic toast message.
      console.error("[daily-360-summary] PDF export failed:", err);
      toast.error(t("copilot.summary360ExportError"));
    } finally {
      setIsExportExpanded(false);
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Full-screen on mobile, large centered card from sm: up — per
        // explicit product requirement ("نافذة كاملة الشاشة على الموبايل").
        // !important overrides beat DialogContent's own baked-in
        // `grid gap-4 p-6` (see components/ui/dialog.tsx) — those defaults
        // were fighting this component's flex/height layout and silently
        // breaking the inner scroll container in production (confirmed via
        // live screenshot: the body rendered with no scrollbar at all).
        className={cn(
          "!grid !max-w-none !gap-0 overflow-hidden !rounded-xl !border !p-0 max-md:[&>button]:right-3 max-md:[&>button]:top-3 max-md:[&>button_svg]:h-3.5 max-md:[&>button_svg]:w-3.5",
          "!left-1/2 !top-1/2 !h-[85dvh] !max-h-[85vh] !w-[calc(100vw-24px)] !-translate-x-1/2 !-translate-y-1/2",
          "sm:!left-1/2 sm:!top-1/2 sm:!h-[90vh] sm:!w-[min(900px,92vw)] sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:!rounded-2xl sm:!border sm:border-border",
        )}
      >
        <div id="daily-360-summary-print-root" className="grid h-full min-h-0 grid-rows-[auto_1fr] font-report">
          {/* ——— Header: title + export only — scope moves into its own
              "نطاق التقرير" bulleted section in the body, matching the
              reference report's structure exactly instead of one merged
              line. ——— */}
          <div className="glass-hero relative shrink-0 border-b border-border/60 p-5 pe-14 max-md:p-3 max-md:pe-11">
            <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
            <div className="relative flex flex-wrap items-center justify-between gap-3 max-md:gap-2">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold max-md:text-lg">
                <span className="crystal-badge h-10 w-10 bg-ai/15 text-ai max-md:h-8 max-md:w-8">
                  <Sparkles className="h-5 w-5" />
                </span>
                {t("copilot.summary360Title")}
              </DialogTitle>
              {summary && (
                <Button
                  variant="secondary"
                  className="h-11 gap-2"
                  onClick={handleExportPdf}
                  disabled={exporting}
                >
                  {exporting ? <Spinner className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
                  {exporting ? t("copilot.summary360ExportingPdf") : t("copilot.summary360ExportPdf")}
                </Button>
              )}
            </div>
          </div>

          {/* ——— Body ——— */}
          <div className="min-h-0 overflow-y-auto p-5 max-md:p-3">
            {query.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
                <Skeleton className="h-64" />
                <Skeleton className="h-40" />
              </div>
            ) : query.isError ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-destructive">
                  {query.error instanceof ApiError ? query.error.message : t("copilot.summary360Error")}
                </p>
                <Button variant="secondary" className="h-11 gap-2" onClick={() => query.refetch()}>
                  <RefreshCw className="h-4 w-4" />
                  {t("copilot.summary360Retry")}
                </Button>
              </div>
            ) : !summary ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("copilot.summary360Empty")}</p>
            ) : (
              <div className="space-y-6 max-md:space-y-3" dir="rtl">
                {/* Executive summary */}
                <section className="glass-card space-y-2 p-4 max-md:space-y-1.5 max-md:p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>📈</span>
                    {t("copilot.summary360ExecutiveSummary")}
                  </h3>
                  <p className="text-sm leading-relaxed max-md:text-[13px] max-md:leading-5">{summary.executiveSummary}</p>
                </section>

                {/* نطاق التقرير — bulleted, matching the reference report's
                    own structure (route/rep/visit-date/customer-count as
                    separate lines, not one merged sentence). */}
                <section className="glass-card space-y-1.5 p-4 max-md:space-y-1 max-md:p-3">
                  <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>📊</span>
                    نطاق التقرير
                  </h3>
                  <ul className="space-y-1 text-sm max-md:text-[13px] max-md:leading-5">
                    <li>
                      <span className="font-medium text-muted-foreground">النطاق: </span>
                      {summary.scopeLabel}
                    </li>
                    <li>
                      <span className="font-medium text-muted-foreground">{summary.roleLabel}: </span>
                      {summary.userName}
                    </li>
                    <li>
                      <span className="font-medium text-muted-foreground">التاريخ: </span>
                      {summary.reportDate}
                    </li>
                    <li>
                      <span className="font-medium text-muted-foreground">الفترة المقارنة: </span>
                      {summary.period.from} إلى {summary.period.to}
                    </li>
                  </ul>
                </section>

                {/* Top issue */}
                {summary.topIssue && (
                  <section className="glow-ai rounded-lg p-4 max-md:p-3">
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden>🔴</span>
                      {t("copilot.summary360TopIssue")}
                    </h3>
                    <p className="text-sm leading-relaxed max-md:text-[13px] max-md:leading-5">{summary.topIssue}</p>
                  </section>
                )}

                {/* Goal */}
                <section className="glass-card p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>🎯</span>
                    {t("copilot.summary360Goal")}
                  </h3>
                  {summary.goal.targetTotal !== null ? (
                    <div className="grid grid-cols-3 gap-3">
                      <Stat label={t("copilot.summary360GoalTarget")} value={summary.goal.targetTotal.toLocaleString()} />
                      <Stat label={t("copilot.summary360GoalActual")} value={summary.goal.actualTotal.toLocaleString()} />
                      <Stat
                        label={t("copilot.summary360GoalRemaining")}
                        value={(summary.goal.remainingGap ?? 0).toLocaleString()}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("copilot.summary360NoGoal")}</p>
                  )}
                </section>

                {/* Lost opportunities are grouped customer-first so one route visit is never repeated per product. */}
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>{"\u{1F3AF}"}</span>
                    {t("copilot.summary360LostOpportunities")}
                  </h3>
                  {summary.lostOpportunities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t(summary.lostOpportunityStatus === "no-customers" ? "copilot.summary360NoCustomers" : summary.lostOpportunityStatus === "no-baseline-sales" ? "copilot.summary360NoBaselineSales" : summary.lostOpportunityStatus === "data-unavailable" ? "copilot.summary360DataUnavailable" : "copilot.summary360NoLostOpportunities")}</p>
                  ) : (
                    <div className="space-y-3">
                      {lostOpportunityGroups.map((customer, customerIndex) => {
                        const customerIsOpen = isExportExpanded || openCustomerCode === customer.customerCode;
                        return (
                          <div key={customer.customerCode} className="glass-card overflow-hidden">
                            <button
                              type="button"
                              className="flex w-full flex-wrap items-center gap-2 bg-slate-900 p-4 text-start text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-950 dark:hover:bg-slate-900"
                              aria-expanded={customerIsOpen}
                              aria-controls={`daily-360-customer-${customer.customerCode}`}
                              onClick={() => setOpenCustomerCode((current) => toggleDaily360OpenCustomer(current, customer.customerCode))}
                            >
                              <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", customerIsOpen && "rotate-180")} aria-hidden />
                              <span className="text-sm font-bold text-white">{customerIndex + 1}. {customer.customerName}</span>
                              <Badge variant="secondary" className="ms-auto border border-slate-500 bg-slate-800 text-slate-100 dark:bg-slate-900">
                                {t("copilot.summary360TotalDecline", { value: customer.totalDeclineQuantity.toLocaleString() })}
                              </Badge>
                              <span className="grid w-full gap-1 text-xs text-slate-300 sm:grid-cols-3">
                                <span>{t("copilot.summary360OpportunityCount", { value: customer.opportunityCount })}</span>
                                <span>{t("copilot.summary360ProductCount", { value: customer.productCount })}</span>
                                <span className="font-medium text-white">{t("copilot.summary360TotalSuggestedQuantity", { value: customer.totalSuggestedQuantity.toLocaleString() })}</span>
                              </span>
                            </button>
                            {customerIsOpen && (
                              <div id={`daily-360-customer-${customer.customerCode}`} className="space-y-3 border-t border-border p-4">
                                {customer.categories.map((category) => {
                                  const categoryKey = daily360CategoryKey(customer.customerCode, category.category);
                                  const categoryIsOpen = isExportExpanded || openCategoryKeys.has(categoryKey);
                                  return (
                                    <section key={categoryKey} className="overflow-hidden rounded-md border border-border bg-card/40">
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 p-3 text-start text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-expanded={categoryIsOpen}
                                        aria-controls={`daily-360-category-${customer.customerCode}-${category.category}`}
                                        onClick={() => setOpenCategoryKeys((current) => toggleDaily360OpenCategory(current, categoryKey))}
                                      >
                                        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", categoryIsOpen && "rotate-180")} aria-hidden />
                                        {category.category}
                                      </button>
                                      {categoryIsOpen && (
                                        <div id={`daily-360-category-${customer.customerCode}-${category.category}`} className="space-y-2 p-3 pt-0">
                                          {category.products.map(({ productCode, opportunity: op }) => (
                                            <div key={productCode} className="space-y-2.5 border-t border-border pt-3 first:border-t-0 first:pt-0">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-medium text-foreground">{op.productName}</p>
                                                {allowedExclusionActions.length > 0 && (
                                                  <details className="text-xs">
                                                    <summary className="cursor-pointer text-muted-foreground">{t("copilot.summary360ExcludeMenu")}</summary>
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                      {allowedExclusionActions.map((scopeType) => {
                                                        const labels: Record<Daily360ExclusionAction, TranslationKey> = {
                                                          CUSTOMER_PRODUCT: "copilot.summary360ExcludeCustomerProduct",
                                                          SALESPERSON_PRODUCT: "copilot.summary360ExcludeSalespersonProduct",
                                                          TEAM_PRODUCT: "copilot.summary360ExcludeTeamProduct",
                                                          COMPANY_PRODUCT: "copilot.summary360ExcludeCompanyProduct",
                                                        };
                                                        return <Button key={scopeType} type="button" size="sm" variant="outline" disabled={exclusionMutation.isPending} onClick={() => excludeProduct(scopeType, op.customerCode, op.productCode)}>{t(labels[scopeType])}</Button>;
                                                      })}
                                                    </div>
                                                  </details>
                                                )}
                                              </div>
                                              <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-4">
                                                <span>{t("copilot.summary360BaselineQuantity", { value: op.baselineNetQuantity.toLocaleString() })}</span>
                                                <span>{t("copilot.summary360RecentQuantity", { value: op.recentNetQuantity.toLocaleString() })}</span>
                                                <span>{t("copilot.summary360DeclineQuantity", { value: op.declineValue.toLocaleString() })}</span>
                                                <span className="font-medium text-foreground">{t("copilot.summary360SuggestedQuantity", { value: op.suggestedQuantity.toLocaleString() })}</span>
                                              </div>
                                              <p className="text-xs text-muted-foreground">
                                                {op.lastVisitDate ? t("copilot.summary360LastVisit", { date: op.lastVisitDate }) : t("copilot.summary360LastVisitUnknown")}
                                              </p>
                                              {op.stoppedProducts.length > 0 && (
                                                <div>
                                                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                                    <Package className="h-3.5 w-3.5" />
                                                    {t("copilot.summary360StoppedProducts")}
                                                  </p>
                                                  <div className="flex flex-wrap gap-1.5">
                                                    {op.stoppedProducts.map((product, productIndex) => (
                                                      <span key={`${product.productName}-${productIndex}`} className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300">
                                                        {product.productName}{" \u00B7 "}{product.quantity.toLocaleString()} {product.unit}{" \u00B7 "}{product.value.toLocaleString()}
                                                      </span>
                                                    ))}
                                                    {Boolean(op.extraProductCount) && (
                                                      <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                                        {t("copilot.summary360MoreProducts", { count: op.extraProductCount! })}
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              )}
                                              <div className="space-y-1.5 rounded-md border border-border bg-card p-2.5">
                                                <p className="text-xs text-foreground"><span className="font-medium text-muted-foreground">{t("copilot.summary360Diagnosis")}: </span>{op.diagnosis}</p>
                                                {op.likelyReason && <p className="text-xs text-foreground"><span className="font-medium text-muted-foreground">{t("copilot.summary360LikelyReason")}: </span>{op.likelyReason}</p>}
                                                <p className="text-xs text-foreground"><span className="font-medium text-muted-foreground">{t("copilot.summary360VisitDecision")}: </span>{op.visitDecision}</p>
                                                {op.visitGoal && <p className="text-xs text-foreground"><span className="font-medium text-muted-foreground">{t("copilot.summary360VisitGoal")}: </span>{op.visitGoal}</p>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </section>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {exclusionsQuery.data && exclusionsQuery.data.length > 0 && (
                  <section className="glass-card space-y-2 p-4 max-md:space-y-1.5 max-md:p-3">
                    <h3 className="text-sm font-semibold">{t("copilot.summary360ExcludedProducts")}</h3>
                    <div className="space-y-2">
                      {exclusionsQuery.data.map((exclusion) => (
                        <div key={exclusion.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span>{exclusion.productCode} ? {t(`copilot.summary360Scope${exclusion.scopeType}` as TranslationKey)}</span>
                          <Button type="button" size="sm" variant="outline" disabled={revokeExclusionMutation.isPending} onClick={() => revokeExclusionMutation.mutate(exclusion.id)}>{t("copilot.summary360RevokeExclusion")}</Button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Collections */}
                <section className="glass-card space-y-3 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>💰</span>
                    {t("copilot.summary360Collections")}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label={t("copilot.summary360Collected")} value={summary.collections.collected.toLocaleString()} />
                    <Stat label={t("copilot.summary360Pending")} value={summary.collections.pending.toLocaleString()} />
                    <Stat label={t("copilot.summary360Bounced")} value={summary.collections.bounced.toLocaleString()} />
                  </div>
                  {summary.collections.priorityDebtors.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("copilot.summary360PriorityDebtors")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {summary.collections.priorityDebtors.map((d, i) => (
                          <Badge key={i} variant="secondary" className="font-normal">
                            {d.customerName} · {d.amount.toLocaleString()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Returns — real Returns entity totals, scoped to today's
                    route customers + comparison period (2026-07-29, was
                    previously computed as a hardcoded zero and not even
                    rendered here at all). */}
                <section className="glass-card space-y-3 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>↩️</span>
                    {t("copilot.summary360Returns")}
                  </h3>
                  {summary.returns.total > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Stat label={t("copilot.summary360ReturnsTotal")} value={summary.returns.total.toLocaleString()} />
                      <Stat
                        label={t("copilot.summary360ReturnsRate")}
                        value={summary.returns.rate !== null ? `${summary.returns.rate}%` : "—"}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("copilot.summary360NoReturns")}</p>
                  )}
                </section>

                {/* Intervention needed */}
                {summary.interventionNeeded.length > 0 && (
                  <section className="glass-card space-y-2 p-4 max-md:space-y-1.5 max-md:p-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden>⚠️</span>
                      {t("copilot.summary360InterventionNeeded")}
                    </h3>
                    <ul className="space-y-1.5">
                      {summary.interventionNeeded.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span
                            className={cn(
                              "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                              c.severity === "high" ? "bg-rose-500" : c.severity === "medium" ? "bg-amber-500" : "bg-muted-foreground",
                            )}
                          />
                          <span>
                            <span className="font-medium">{c.name}</span> — {c.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Root causes — 3-item numbered list */}
                <section className="glass-card space-y-2 p-4 max-md:space-y-1.5 max-md:p-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>🧩</span>
                    {t("copilot.summary360RootCauses")}
                  </h3>
                  <p className="text-sm text-muted-foreground">{summary.rootCauses.narrative}</p>
                  <ol className="space-y-1.5 ps-1">
                    {summary.rootCauses.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="crystal-badge h-5 w-5 shrink-0 bg-ai/15 text-[11px] font-bold text-ai">{i + 1}</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                {/* Executive decision */}
                <section className="glow-ai rounded-lg p-4 max-md:p-3">
                  <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>🎯</span>
                    {t("copilot.summary360ExecutiveDecision")}
                  </h3>
                  <p className="text-sm leading-relaxed">{summary.executiveDecision}</p>
                </section>

                {/* Execution plan — 4-column table */}
                <section className="glass-card space-y-3 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden>📋</span>
                    {t("copilot.summary360ExecutionPlan")}
                  </h3>
                  <ExecutionPlanTable steps={summary.executionPlan} t={t} />
                </section>

                {/* Closing phrase */}
                <section className="flex items-start gap-2 rounded-lg bg-background/60 p-4 text-sm italic text-muted-foreground">
                  <Quote className="mt-0.5 h-4 w-4 shrink-0" />
                  {summary.closingPhrase}
                </section>

                {summary.warnings.length > 0 && (
                  <div className="space-y-1">
                    {summary.warnings.map((w, i) => (
                      <p key={i} className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                <p className="text-center text-[11px] text-muted-foreground">
                  {summary.narrativeSource === "ai" ? t("copilot.summary360AiSourced") : t("copilot.summary360TemplateSourced")}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/60 p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}

function ExecutionPlanTable({
  steps,
  t,
}: {
  steps: VisitCopilot360ExecutionStep[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  if (steps.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
            <th className="px-2 py-2 text-start font-medium">{t("copilot.summary360PlanPriority")}</th>
            <th className="px-2 py-2 text-start font-medium">{t("copilot.summary360PlanAction")}</th>
            <th className="px-2 py-2 text-start font-medium">{t("copilot.summary360PlanOwner")}</th>
            <th className="px-2 py-2 text-start font-medium">{t("copilot.summary360PlanMetric")}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0">
              <td className="px-2 py-2.5 align-top">
                <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", priorityBadgeClass(step.priority))}>
                  {step.priority}
                </span>
              </td>
              <td className="px-2 py-2.5 align-top">{step.action}</td>
              <td className="px-2 py-2.5 align-top text-muted-foreground">{step.owner}</td>
              <td className="px-2 py-2.5 align-top text-muted-foreground">{step.successMetric}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
