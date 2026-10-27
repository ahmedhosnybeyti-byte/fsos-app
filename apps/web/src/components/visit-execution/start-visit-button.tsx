"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
import { visitExecutionApi } from "@/lib/api/visit-execution";

export function StartVisitButton({ customerCode }: { customerCode: string }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const request = useRef<{ code: string; key: string } | null>(null);
  const allowed = user?.role.code === "SALES_REP" && ["sfa.access", "visits.execute"].every((p) => user.permissions?.includes(p));
  const access = useQuery({ queryKey: ["visit-execution-access", user?.companyId, user?.id], queryFn: visitExecutionApi.access, enabled: !!allowed, retry: false, refetchOnWindowFocus: false });
  const start = useMutation({ mutationFn: () => {
    if (request.current?.code !== customerCode) request.current = { code: customerCode, key: crypto.randomUUID() };
    return visitExecutionApi.start({ customerCode, requestKey: request.current!.key, entrySource: "VISIT_COPILOT" });
  }, onSuccess: (visit) => router.push(`/dashboard/visit-execution/${encodeURIComponent(visit.id)}`) });
  if (!allowed || !access.data?.allowed) return null;
  return <div className="space-y-2"><Button disabled={start.isPending} onClick={() => start.mutate()}><Play className="h-4 w-4" />{t(start.isPending ? "visit.starting" : "visit.start")}</Button>
    {start.isError && <p role="alert" className="text-sm text-destructive">{t("visit.startError")}</p>}</div>;
}
