"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/translation-provider";

export function TemporaryPasswordCard({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return <div className="glass-card space-y-2 border-primary/50 p-4"><p className="font-medium">{t("shared.tempPassword.title", { email })}</p><code className="block break-all rounded bg-secondary p-2">{password}</code><p className="text-sm text-muted-foreground">{t("shared.tempPassword.description")}</p><div className="flex gap-2"><Button size="sm" onClick={() => navigator.clipboard.writeText(password).then(() => toast.success(t("shared.toast.copied")))}>{t("shared.action.copy")}</Button><Button size="sm" variant="outline" onClick={onDismiss}>{t("shared.action.dismiss")}</Button></div></div>;
}
