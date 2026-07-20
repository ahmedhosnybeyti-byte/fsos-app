"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/components/translation-provider";

export function LanguageToggle() {
  const { t, toggleLocale } = useTranslation();
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={toggleLocale} title={t("language.switchTo")}>
      <Languages className="h-4 w-4" />
      {t("language.switchTo")}
    </Button>
  );
}
