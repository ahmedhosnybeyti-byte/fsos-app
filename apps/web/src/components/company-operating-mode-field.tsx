"use client";

import { companyOperatingModes, getCompanyModuleEntitlements, type CompanyOperatingMode } from "@field-sales-os/schemas";
import { useTranslation } from "@/components/translation-provider";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CompanyOperatingModeField({ value, onChange, disabled = false, featureAccess, compact = false }: {
  value: CompanyOperatingMode; onChange: (mode: CompanyOperatingMode) => void; disabled?: boolean;
  featureAccess?: import("@field-sales-os/schemas").CompanyFeatureAccess;
  compact?: boolean;
}) {
  const { locale } = useTranslation();
  const text = (ar: string, en: string) => locale === "ar" ? ar : en;
  return <div className="space-y-3">
    <Label htmlFor="company-operating-mode">{text("نظام تشغيل الشركة", "Company operating system")}</Label>
    <Select dir={locale === "ar" ? "rtl" : "ltr"} value={value} disabled={disabled} onValueChange={(mode) => onChange(mode as CompanyOperatingMode)}>
      <SelectTrigger id="company-operating-mode" className="h-auto min-h-10 w-full text-start"><SelectValue /></SelectTrigger>
      <SelectContent>{companyOperatingModes.map((mode) => <SelectItem key={mode.value} value={mode.value}>
        <span className="flex flex-col text-start"><span>{mode.arabicLabel}</span><span dir="ltr" className="text-xs text-muted-foreground">{mode.englishLabel}</span></span>
      </SelectItem>)}</SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">{text("مستقل عن الباقة التجارية ودور المستخدم. الوحدات التشغيلية تحتاج تفعيل الشاشة وصلاحيات صريحة. تغيير النظام يحفظ البيانات والأرصدة.", "Independent of plan and user role. Operations require screen activation and explicit permissions. Changing mode preserves data and balances.")}</p>
    <details open={compact ? undefined : true} className="space-y-3">
    <summary className="cursor-pointer rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{text("الوحدات المتاحة والجزئية والمؤجلة", "Available, partial and deferred modules")}</summary>
    <ul className="space-y-2 text-sm" aria-label={text("حالة الوحدات", "Module availability")}>
      {getCompanyModuleEntitlements(value).map((module) => {
        const screen = module.key === "operations-setup" ? "sfa-setup" : module.key === "warehouse" ? "warehouse-core" : null;
        const activated = screen && featureAccess?.[screen] === "ENABLED";
        const status = module.delivery === "DEFERRED" ? text("مؤجل — غير منفذ", "Deferred — not implemented")
          : !module.eligible ? text("خارج النظام المختار", "Outside selected mode")
          : module.delivery === "PARTIAL" ? text("جزئي — يحتاج اعتمادًا", "Partial — approval required")
          : screen ? (activated ? text("الشاشة مفعّلة؛ تلزم الصلاحيات", "Screen enabled; permissions required") : text("متاح للتفعيل", "Available for activation"))
          : text("حسب الصلاحيات الحالية", "Subject to existing access");
        return <li key={module.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
          <span className="min-w-0 flex-1">{text(module.arabicLabel, module.englishLabel)}</span>
          <Badge variant="outline" className="max-w-full whitespace-normal text-start">{status}</Badge>
        </li>;
      })}
    </ul>
    </details>
  </div>;
}
