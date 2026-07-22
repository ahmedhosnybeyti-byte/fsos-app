"use client";

// Customer-level list view — shown instead of the City-level RankingList
// once useTerritoryHierarchy has drilled into a city (currentLevel.key ===
// "customer"). Visually mirrors the old page.tsx's RankingList (same button
// row / border / selected-state Tailwind classes) but recreated locally
// since RankingList isn't exported, and works off HierarchyLevelNode instead
// of TerritorySummaryItem (customers have no health tier/why/etc.).

import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";
import type { HierarchyLevelNode } from "./hierarchy-engine";

export interface TerritoryCustomerListProps {
  cityName: string;
  nodes: HierarchyLevelNode[];
  isLoading: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string, name: string) => void;
  onGoBack: () => void;
}

function formatSales(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function TerritoryCustomerList({
  cityName,
  nodes,
  isLoading,
  selectedNodeId,
  onSelectNode,
  onGoBack,
}: TerritoryCustomerListProps) {
  const { t } = useTranslation();

  // Sorted-by-sales-descending, same "highest value first" convention as
  // the City-level RankingList's default (activeMetric) sort.
  const sorted = useMemo(() => [...nodes].sort((a, b) => b.metricValue - a.metricValue), [nodes]);

  return (
    <Card className="glass-card rise-in">
      <CardHeader className="space-y-2">
        <button
          type="button"
          onClick={onGoBack}
          className="flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("territoryIntelligence.goUp")}
        </button>
        <div>
          <CardTitle>{t("territoryIntelligence.customerLevelTitle", { name: cityName })}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("territoryIntelligence.customerLevelHint")}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Spinner className="h-5 w-5" />
            {t("territoryIntelligence.loading")}
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("territoryIntelligence.customerLevelEmpty")}</p>
        ) : (
          sorted.map((node) => {
            const selected = node.id === selectedNodeId;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onSelectNode(node.id, node.name)}
                className={cn(
                  "flex w-full flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-start text-sm transition-colors",
                  selected ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/30",
                )}
              >
                <span className="truncate font-medium">{node.name}</span>
                <Badge variant="outline">
                  {t("territoryIntelligence.customerSalesLabel")}: {formatSales(node.metricValue)}
                </Badge>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
