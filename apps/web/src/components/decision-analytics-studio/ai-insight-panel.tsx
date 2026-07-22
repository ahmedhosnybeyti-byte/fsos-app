"use client";

import { AlertTriangle, TrendingDown, TrendingUp, UserX, Wallet, PackageMinus, Target } from "lucide-react";
import type { DecisionInsightItem, DecisionInsightType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

// AI Insight panel — renders SGI's already-persisted situations, scoped down
// to the current filtered analysis by the backend (see decision-analytics-
// studio.service.ts's query() — no live LLM call per interaction, same
// 2026-07-22 product decision as Territory Intelligence's panelAiInsightTitle
// section reuses).

const TYPE_ICON: Record<DecisionInsightType, typeof AlertTriangle> = {
  LOST_SALES: TrendingDown,
  CUSTOMER_DECLINING: TrendingDown,
  CUSTOMER_INACTIVE: UserX,
  COLLECTION_RISK: Wallet,
  GROWTH_OPPORTUNITY: TrendingUp,
  PRODUCT_DECLINE: PackageMinus,
  TARGET_BEHIND: Target,
};

const SEVERITY_VARIANT: Record<DecisionInsightItem["severity"], "destructive" | "warning" | "secondary"> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

const SEVERITY_LABEL_KEY: Record<DecisionInsightItem["severity"], TranslationKey> = {
  high: "decisionAnalyticsStudio.severityHigh",
  medium: "decisionAnalyticsStudio.severityMedium",
  low: "decisionAnalyticsStudio.severityLow",
};

export function AiInsightPanel({ insights }: { insights: DecisionInsightItem[] }) {
  const { t } = useTranslation();

  return (
    <Card className="glass-card rise-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          {t("decisionAnalyticsStudio.aiInsightTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("decisionAnalyticsStudio.aiInsightEmpty")}</p>
        ) : (
          insights.map((item, i) => {
            const Icon = TYPE_ICON[item.type] ?? AlertTriangle;
            return (
              <div key={i} className="flex items-start gap-3 rounded-md border border-border p-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <Badge variant={SEVERITY_VARIANT[item.severity]}>{t(SEVERITY_LABEL_KEY[item.severity])}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
