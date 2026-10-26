"use client";

import { useQuery } from "@tanstack/react-query";
import VisitCopilotPage from "../visit-copilot/page";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Spinner } from "@/components/ui/spinner";
import { sfaSetupApi } from "@/lib/api/sfa-setup";
import { canExecuteVisits, showVisitExecution } from "@/lib/visit-execution-access";

// Reuse the existing scoped customer selector and Start Visit action.
// Persisted visits continue to open the independent [id] execution screen.
export default function VisitExecutionEntryPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const mode = useQuery({ queryKey: ["sfa-mode", user?.companyId], queryFn: sfaSetupApi.mode,
    enabled: canExecuteVisits(user), retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (isLoading || (canExecuteVisits(user) && mode.isPending)) return <Spinner className="h-6 w-6" />;
  if (!showVisitExecution(user, mode.data?.operatingMode)) return <p role="alert" className="glass-card p-4 text-destructive">{t("visit.accessDenied")}</p>;
  return <><h1 className="mb-4 text-2xl font-bold sm:text-3xl">{t("visit.title")}</h1><VisitCopilotPage /></>;
}
