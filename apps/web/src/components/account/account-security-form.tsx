"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { toast } from "sonner";
import { changePasswordSchema, type ChangePasswordInput } from "@field-sales-os/schemas";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { finalizePasswordChange } from "@/lib/account-security";
import { useTranslation } from "@/components/translation-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface PasswordFieldProps {
  id: "currentPassword" | "newPassword" | "confirmNewPassword";
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  register: UseFormRegister<ChangePasswordInput>;
}

function PasswordField({ id, label, autoComplete, error, register }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={isVisible ? "text" : "password"} autoComplete={autoComplete} className="pe-11" {...register(id)} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute end-0 top-0 h-9 w-9 text-muted-foreground"
          aria-label={isVisible ? t("account.hidePassword") : t("account.showPassword")}
          onClick={() => setIsVisible((visible) => !visible)}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AccountSecurityForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordInput) => authApi.changePassword(values),
    onSuccess: async () => {
      toast.success(t("account.passwordChangeSuccess"));
      await finalizePasswordChange({
        logout: authApi.logout,
        clearLocalSession: () => window.sessionStorage.clear(),
        clearQueryCache: () => queryClient.clear(),
        redirect: (path) => router.replace(path),
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "PASSWORD_REUSE_NOT_ALLOWED") {
        toast.error(t("account.passwordReuseError"));
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        toast.error(t("account.currentPasswordIncorrect"));
        return;
      }
      toast.error(t("account.passwordChangeError"));
    },
  });

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>{t("account.passwordTitle")}</CardTitle>
        <CardDescription>{t("account.passwordDescription")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
        <CardContent className="space-y-4">
          <PasswordField
            id="currentPassword"
            label={t("account.currentPassword")}
            autoComplete="current-password"
            error={errors.currentPassword ? t("account.currentPasswordRequired") : undefined}
            register={register}
          />
          <PasswordField
            id="newPassword"
            label={t("account.newPassword")}
            autoComplete="new-password"
            error={errors.newPassword ? t("account.passwordRequirements") : undefined}
            register={register}
          />
          <PasswordField
            id="confirmNewPassword"
            label={t("account.confirmNewPassword")}
            autoComplete="new-password"
            error={errors.confirmNewPassword ? t("account.passwordMismatch") : undefined}
            register={register}
          />
        </CardContent>
        <CardContent className="pt-0">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {mutation.isPending ? t("account.loggingOut") : t("account.changePassword")}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}