"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { changeEmailSchema, type ChangeEmailInput } from "@field-sales-os/schemas";
import { authApi } from "@/lib/api";
import { finalizePasswordChange } from "@/lib/account-security";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function AccountEmailForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema) });
  const mutation = useMutation({
    mutationFn: authApi.changeEmail,
    onSuccess: async () => {
      toast.success(t("account.emailChangeSuccess"));
      await finalizePasswordChange({ logout: authApi.logout, clearLocalSession: () => window.sessionStorage.clear(), clearQueryCache: () => queryClient.clear(), redirect: (path) => router.replace(path) });
    },
    onError: () => toast.error(t("account.emailChangeError")),
  });
  return <Card className="glass-card"><CardHeader><CardTitle>{t("account.emailTitle")}</CardTitle><CardDescription>{t("account.emailDescription")}</CardDescription></CardHeader><form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))}><CardContent className="space-y-4"><Label>{t("account.currentPassword")}<Input type="password" autoComplete="current-password" {...register("currentPassword")} /></Label><Label>{t("account.newEmail")}<Input type="email" autoComplete="email" {...register("newEmail")} /></Label><Label>{t("account.confirmEmail")}<Input type="email" autoComplete="email" {...register("confirmEmail")} /></Label>{errors.confirmEmail && <p className="text-xs text-destructive">{t("account.emailMismatch")}</p>}</CardContent><CardContent className="pt-0"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending && <Spinner />}{mutation.isPending ? t("account.loggingOut") : t("account.changeEmail")}</Button></CardContent></form></Card>;
}