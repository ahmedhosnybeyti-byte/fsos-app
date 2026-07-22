"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MapPinned, Undo2 } from "lucide-react";
import { companiesApi, territoryIntelligenceApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { TerritoryExecutiveItem, TerritoryIntelligenceExecutiveResponse, TerritorySummaryItem } from "@/lib/types";
import { buildDecisionStudioReturnLink } from "@/lib/decision-analytics-state";
import { loadBoundaryIndex, normalizeTerritoryName, resolveBoundaryAssetUrl, type BoundaryFeatureIndex } from "@/components/territory-intelligence/boundary-registry";
import { buildTerritoryHierarchyLevels, useTerritoryHierarchy, type DrillPathEntry } from "@/components/territory-intelligence/hierarchy-engine";
import { TERRITORY_TIER_COLOR, TerritoryMap, type TerritoryMapMetric } from "@/components/territory-intelligence/territory-map";
import { TerritoryLayersSidebar } from "@/components/territory-intelligence/territory-layers-sidebar";
import { TerritoryDecisionPanel } from "@/components/territory-intelligence/territory-decision-panel";
import { TerritoryCustomerList } from "@/components/territory-intelligence/territory-customer-list";

// Territory Intelligence — "Enterprise Territory Intelligence Workspace"
// redesign (client-mandated: polygon choropleth, not marker map; multi-layer
// analysis; a generic City -> Customer drill-down engine; a full executive
// decision panel — see boundary-registry.ts / hierarchy-engine.ts /
// territory-map.tsx / territory-layers-sidebar.tsx / territory-decision-panel.tsx
// / territory-customer-list.tsx for the pieces this page wires together).
//
// This page is the ONLY place the concrete V1 "city" / "customer" hierarchy
// keys are branched on for UI purposes (which right-hand panel / which
// bottom list to render) — the engine and map components themselves stay
// generic. Executive Mode (role-gated quick drill-in) is unchanged from the
// original build; nothing in this redesign touched it.

const EMPTY_TERRITORIES: TerritorySummaryItem[] = [];

const METRIC_LABEL_KEY: Record<TerritoryMapMetric, TranslationKey> = {
  healthScore: "territoryIntelligence.metricHealthScore",
  salesGrowthPct: "territoryIntelligence.metricSalesGrowth",
  lostSalesCount: "territoryIntelligence.metricLostSales",
  visitCoveragePct: "territoryIntelligence.metricVisitCoverage",
  collectionHealthPct: "territoryIntelligence.metricCollectionHealth",
  opportunityValueSar: "territoryIntelligence.metricOpportunityValue",
  riskLevel: "territoryIntelligence.metricRiskLevel",
};

function metricValueOf(territory: TerritorySummaryItem, metric: TerritoryMapMetric): number | null {
  switch (metric) {
    case "healthScore":
      return territory.healthScore;
    case "salesGrowthPct":
      return territory.metrics.salesGrowthPct;
    case "lostSalesCount":
      return territory.metrics.lostSalesCount;
    case "visitCoveragePct":
      return territory.metrics.visitCoveragePct;
    case "collectionHealthPct":
      return territory.metrics.collectionHealthPct;
    case "opportunityValueSar":
      return territory.opportunityValueSar;
    case "riskLevel":
      return 100 - territory.healthScore;
    default:
      return null;
  }
}

function formatAmount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// useSearchParams() requires a Suspense boundary above it in the App Router
// (see assistant/page.tsx's identical wrapper) — added only because this
// page now optionally reads ?dasState=&dasCity=... for the Decision
// Analytics Studio "Open Territory Intelligence" handoff (2026-07-22,
// additive-only: nothing below changes for a visitor who arrives without
// those params, which is every pre-existing entry point to this page).
export default function TerritoryIntelligencePage() {
  return (
    <Suspense fallback={null}>
      <TerritoryIntelligenceWorkspace />
    </Suspense>
  );
}

function TerritoryIntelligenceWorkspace() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Present only when this page was opened via Decision Analytics Studio's
  // "Open Territory Intelligence" action — raw, unmodified, handed straight
  // back to buildDecisionStudioReturnLink() so Decision Analytics Studio's
  // Return restores its state exactly as it was left (no re-encoding here).
  const dasReturnState = searchParams.get("dasState");
  const dasCity = searchParams.get("dasCity");

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<TerritoryMapMetric>("healthScore");
  const [executiveMode, setExecutiveMode] = useState(false);
  const [dasCityConsumed, setDasCityConsumed] = useState(false);

  const canToggleExecutiveMode = user?.role.code === "COMPANY_ADMIN" || user?.role.code === "MANAGER";

  const summaryQuery = useQuery({
    queryKey: ["territory-intelligence", "summary"],
    queryFn: territoryIntelligenceApi.summary,
  });

  // Lazy fetch — only hit once Executive Mode is actually opened.
  const executiveQuery = useQuery({
    queryKey: ["territory-intelligence", "executive"],
    queryFn: territoryIntelligenceApi.executive,
    enabled: executiveMode,
  });

  // Country-agnostic boundary-asset resolution: no backend involvement, the
  // company's own (already-existing, unmodified) profile endpoint is the
  // only thing that determines which /public GeoJSON file loads.
  const companyProfileQuery = useQuery({
    queryKey: ["companies", "profile"],
    queryFn: companiesApi.getProfile,
  });

  const boundaryAssetUrl = resolveBoundaryAssetUrl(companyProfileQuery.data?.country);

  const boundaryIndexQuery = useQuery({
    queryKey: ["territory-boundary-index", boundaryAssetUrl],
    queryFn: () => (boundaryAssetUrl ? loadBoundaryIndex(boundaryAssetUrl) : Promise.resolve<BoundaryFeatureIndex>({ byName: new Map() })),
    enabled: companyProfileQuery.isSuccess,
  });

  const territories = summaryQuery.data?.territories ?? EMPTY_TERRITORIES;

  // Auto-select the territory Decision Analytics Studio was scoped to
  // (single-City filter case only — see buildTerritoryIntelligenceDeepLink)
  // once the real territory list has loaded. Runs at most once per visit
  // (dasCityConsumed guard) so it never fights a selection the user makes
  // afterward.
  useEffect(() => {
    if (!dasCity || dasCityConsumed || territories.length === 0) return;
    const match = territories.find((terr) => normalizeTerritoryName(terr.name) === normalizeTerritoryName(dasCity));
    if (match) setSelectedNodeId(match.id);
    setDasCityConsumed(true);
  }, [dasCity, dasCityConsumed, territories]);

  function handleReturnToDecisionStudio() {
    if (dasReturnState) router.push(buildDecisionStudioReturnLink(dasReturnState));
  }

  function handleSelectNode(id: string, _name: string) {
    setSelectedNodeId(id);
  }

  // No hierarchy.goToLevel(0) needed here — NormalView (below) only ever
  // mounts once territories.length > 0, and toggling executiveMode off
  // unmounts/remounts it, which resets its internal drillPath state to []
  // (the city/root level) for free.
  function handleExecutiveDrillDown(territoryId: string) {
    setSelectedNodeId(territoryId);
    setExecutiveMode(false);
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-amber-600/15 text-amber-700 drop-shadow-[0_0_24px_hsl(38_92%_45%/0.4)] dark:text-amber-400 sm:flex">
            <MapPinned className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("territoryIntelligence.title")}</h1>
            <p className="text-muted-foreground">{t("territoryIntelligence.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dasReturnState && (
            <Button variant="outline" size="sm" onClick={handleReturnToDecisionStudio}>
              <Undo2 className="h-3.5 w-3.5" />
              {t("territoryIntelligence.returnToDecisionStudio")}
            </Button>
          )}
          {canToggleExecutiveMode && (
            <Button variant={executiveMode ? "default" : "outline"} onClick={() => setExecutiveMode((v) => !v)}>
              {t("territoryIntelligence.executiveModeToggle")}
            </Button>
          )}
        </div>
      </div>

      {summaryQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Spinner className="h-5 w-5" />
          {t("territoryIntelligence.loading")}
        </div>
      ) : summaryQuery.isError ? (
        <p className="py-16 text-center text-sm text-destructive">{t("territoryIntelligence.errorLoad")}</p>
      ) : territories.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("territoryIntelligence.emptyState")}</p>
      ) : executiveMode ? (
        <ExecutiveView
          data={executiveQuery.data}
          isLoading={executiveQuery.isLoading}
          isError={executiveQuery.isError}
          onDrillDown={handleExecutiveDrillDown}
        />
      ) : (
        <NormalView
          territories={territories}
          generatedAt={summaryQuery.data?.generatedAt ?? new Date().toISOString()}
          boundaryIndex={boundaryIndexQuery.data ?? null}
          activeMetric={activeMetric}
          onSelectMetric={setActiveMetric}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          onClearSelection={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

function ExecutiveView({
  data,
  isLoading,
  isError,
  onDrillDown,
}: {
  data: TerritoryIntelligenceExecutiveResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onDrillDown: (territoryId: string) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Spinner className="h-5 w-5" />
        {t("territoryIntelligence.loading")}
      </div>
    );
  }

  if (isError || !data) {
    return <p className="py-16 text-center text-sm text-destructive">{t("territoryIntelligence.errorLoad")}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ExecutiveListCard title={t("territoryIntelligence.executiveTopOpportunities")} items={data.topOpportunities} onSelect={onDrillDown} />
      <ExecutiveListCard title={t("territoryIntelligence.executiveWorstTerritories")} items={data.worstTerritories} onSelect={onDrillDown} />
      <ExecutiveSingleCard title={t("territoryIntelligence.executiveFastestWin")} item={data.fastestWin} onSelect={onDrillDown} />
      <ExecutiveSingleCard title={t("territoryIntelligence.executiveBiggestRisk")} item={data.biggestRisk} onSelect={onDrillDown} />
    </div>
  );
}

function ExecutiveItemRow({ item, onSelect }: { item: TerritoryExecutiveItem; onSelect: (territoryId: string) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onSelect(item.territoryId)}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-start transition-colors hover:bg-secondary/30"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.value !== null && <Badge variant="secondary">{formatAmount(item.value)}</Badge>}
        <span className="text-xs text-primary">{t("territoryIntelligence.executiveViewMap")}</span>
      </div>
    </button>
  );
}

function ExecutiveListCard({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: TerritoryExecutiveItem[];
  onSelect: (territoryId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("territoryIntelligence.emptyState")}</p>
        ) : (
          items.map((item) => <ExecutiveItemRow key={item.territoryId} item={item} onSelect={onSelect} />)
        )}
      </CardContent>
    </Card>
  );
}

function ExecutiveSingleCard({
  title,
  item,
  onSelect,
}: {
  title: string;
  item: TerritoryExecutiveItem | null;
  onSelect: (territoryId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!item ? <p className="text-sm text-muted-foreground">{t("territoryIntelligence.emptyState")}</p> : <ExecutiveItemRow item={item} onSelect={onSelect} />}
      </CardContent>
    </Card>
  );
}

// Breadcrumb driven directly by the hierarchy engine's drillPath — clicking
// the root goes back to the "city" level, clicking any intermediate segment
// jumps to that level (goToLevel semantics), the last segment is the current
// level and is inert.
function TerritoryBreadcrumb({ drillPath, onGoToLevel }: { drillPath: DrillPathEntry[]; onGoToLevel: (index: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="glass-card rise-in flex flex-wrap items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm">
      <button
        type="button"
        onClick={() => onGoToLevel(0)}
        className={cn(
          "rounded px-1.5 py-0.5 transition-colors",
          drillPath.length === 0 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("territoryIntelligence.breadcrumbRoot")}
      </button>
      {drillPath.map((entry, i) => {
        const isCurrent = i === drillPath.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
            <button
              type="button"
              onClick={() => onGoToLevel(i + 1)}
              disabled={isCurrent}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.nodeName}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function QuickTools() {
  const { t } = useTranslation();
  return (
    <div className="glass-card rise-in flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <span className="text-sm font-medium text-muted-foreground">{t("territoryIntelligence.quickToolsTitle")}</span>
      <Button type="button" variant="outline" size="sm" disabled title="Coming soon">
        {t("territoryIntelligence.exportPpt")}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled title="Coming soon">
        {t("territoryIntelligence.exportImage")}
      </Button>
    </div>
  );
}

// City-level bottom list — the pre-redesign RankingList, extended to the
// full 7-metric TerritoryMapMetric union. TerritoryCustomerList (built
// alongside the decision panel) is this list's direct counterpart at the
// Customer level.
function CityRankingList({
  territories,
  activeMetric,
  selectedNodeId,
  onSelectNode,
}: {
  territories: TerritorySummaryItem[];
  activeMetric: TerritoryMapMetric;
  selectedNodeId: string | null;
  onSelectNode: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const metricLabel = t(METRIC_LABEL_KEY[activeMetric]);

  const sorted = useMemo(() => {
    return [...territories].sort((a, b) => {
      const av = metricValueOf(a, activeMetric);
      const bv = metricValueOf(b, activeMetric);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    });
  }, [territories, activeMetric]);

  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle>{t("territoryIntelligence.rankingTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {sorted.map((territory) => {
          const value = metricValueOf(territory, activeMetric);
          const selected = territory.id === selectedNodeId;
          return (
            <button
              key={territory.id}
              type="button"
              onClick={() => onSelectNode(territory.id, territory.name)}
              className={cn(
                "flex w-full flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-start text-sm transition-colors",
                selected ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/30",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TERRITORY_TIER_COLOR[territory.tier] }} />
                <span className="truncate font-medium">{territory.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">
                  {metricLabel}: {value === null ? "—" : formatAmount(value)}
                </Badge>
                <Badge variant="secondary">{t("territoryIntelligence.rankingCustomersBadge", { count: territory.customerCount })}</Badge>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NormalView({
  territories,
  generatedAt,
  boundaryIndex,
  activeMetric,
  onSelectMetric,
  selectedNodeId,
  onSelectNode,
  onClearSelection,
}: {
  territories: TerritorySummaryItem[];
  generatedAt: string;
  boundaryIndex: BoundaryFeatureIndex | null;
  activeMetric: TerritoryMapMetric;
  onSelectMetric: (metric: TerritoryMapMetric) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string, name: string) => void;
  onClearSelection: () => void;
}) {
  const { t } = useTranslation();

  // The hierarchy hook is deliberately mounted HERE, inside NormalView, and
  // not in the parent page component. NormalView only ever renders once
  // territories.length > 0 (guarded by the parent), so this hook's very
  // first data fetch already has the real, loaded territories to build
  // levels from. Calling this hook at the top of the page component instead
  // (the bug this replaced) meant its first fetch ran while territories was
  // still an empty placeholder array — and since TanStack Query caches by
  // queryKey (which didn't change once real data arrived), the map was
  // permanently stuck on an empty node list even after the rest of the
  // screen had real data. See PROJECT_LOG.md for the full diagnosis.
  const hierarchyLevels = useMemo(() => buildTerritoryHierarchyLevels(territories), [territories]);
  const hierarchy = useTerritoryHierarchy(hierarchyLevels);

  function handleDrillInto(nodeId: string, nodeName: string) {
    hierarchy.drillInto(nodeId, nodeName);
    onClearSelection();
  }

  function handleGoToLevel(index: number) {
    hierarchy.goToLevel(index);
    onClearSelection();
  }

  const isCityLevel = hierarchy.currentLevel.key === "city";
  const selectedTerritory = isCityLevel ? (territories.find((x) => x.id === selectedNodeId) ?? null) : null;

  return (
    <div className="space-y-6">
      <TerritoryBreadcrumb drillPath={hierarchy.drillPath} onGoToLevel={handleGoToLevel} />

      <div className={cn("grid gap-4", isCityLevel ? "lg:grid-cols-[220px_minmax(0,1fr)_360px]" : "lg:grid-cols-[220px_minmax(0,1fr)]")}>
        <TerritoryLayersSidebar activeMetric={activeMetric} onSelectMetric={onSelectMetric} />

        <Card className="glass-card rise-in overflow-hidden p-0">
          <TerritoryMap
            nodes={hierarchy.nodes}
            isPolygonLevel={hierarchy.currentLevel.isPolygonLevel}
            activeMetric={activeMetric}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            boundaryIndex={boundaryIndex}
          />
        </Card>

        {isCityLevel &&
          (selectedTerritory ? (
            <TerritoryDecisionPanel
              key={selectedTerritory.id}
              territory={selectedTerritory}
              allTerritories={territories}
              generatedAt={generatedAt}
              activeMetric={activeMetric}
              onClose={onClearSelection}
              onDrillDown={() => handleDrillInto(selectedTerritory.id, selectedTerritory.name)}
              canDrillDeeper={hierarchy.canDrillDeeper}
            />
          ) : (
            <Card className="glass-card rise-in flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t("territoryIntelligence.selectTerritoryHint")}
            </Card>
          ))}
      </div>

      <QuickTools />

      {isCityLevel ? (
        <CityRankingList territories={territories} activeMetric={activeMetric} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
      ) : (
        <TerritoryCustomerList
          cityName={hierarchy.drillPath.at(-1)?.nodeName ?? ""}
          nodes={hierarchy.nodes}
          isLoading={hierarchy.isLoading}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onGoBack={() => handleGoToLevel(0)}
        />
      )}
    </div>
  );
}
