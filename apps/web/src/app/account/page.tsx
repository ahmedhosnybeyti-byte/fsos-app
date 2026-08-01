"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, UserRound } from "lucide-react";
import { AccountSecurityForm } from "@/components/account/account-security-form";
import { useTranslation } from "@/components/translation-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { companiesApi } from "@/lib/api";

export default function AccountPage() {
  const { user, isLoading } = useRequireAuth();
  const { t } = useTranslation();
  const companyQuery = useQuery({
    queryKey: ["companies", "me"],
    queryFn: companiesApi.me,
    enabled: Boolean(user?.companyId),
    retry: false,
  });

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const details = [
    [t("account.name"), user.fullName],
    [t("account.email"), user.email],
    [t("account.role"), user.role.name],
    [t("account.company"), user.companyId ? companyQuery.data?.name ?? t("account.companyUnavailable") : t("account.noCompany")],
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("account.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("account.subtitle")}</p>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" />
            {t("account.profileTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background/40 p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <AccountSecurityForm />
    </main>
  );
}