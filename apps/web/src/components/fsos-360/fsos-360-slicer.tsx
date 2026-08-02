"use client";

import { useTranslation } from "@/components/translation-provider";
import { cn } from "@/lib/utils";

export interface Fsos360SlicerOption {
  value: string;
  label: string;
}

/**
 * Visible Slicer Buttons — for filters with a small, known set of values
 * (Company, Region, City, Branch, Route per the Interaction Blueprint,
 * Section 5 "Slicer First Principle"). This is deliberately a single-select
 * button group, not a Dropdown List: the user sees and picks the value
 * directly. Smart Slicer (search + scroll + multi-select) stays reserved
 * for large-cardinality fields (Customer, Product, Brand, Category, Sales Rep).
 */
export function Fsos360Slicer({
  labelKey,
  options,
  value,
  disabled,
  loading,
  error,
  reason,
  onChange,
}: {
  labelKey: string;
  options: Fsos360SlicerOption[];
  value: string;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  reason?: string;
  onChange: (value: string, label?: string) => void;
}) {
  const { t } = useTranslation();
  const tr = (key: string) => t(key as never);
  const isDisabled = disabled || loading || error;

  return (
    <div className="group relative min-w-0">
      <p className="mb-1.5 text-xs text-muted-foreground">{tr(labelKey)}</p>
      <div role="group" aria-label={tr(labelKey)} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onChange("", undefined)}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            !value
              ? "border-primary bg-primary/10 text-primary"
              : "border-input bg-background text-muted-foreground hover:bg-secondary/50",
          )}
        >
          {tr("fsos360.auto")}
        </button>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(option.value, option.label)}
              className={cn(
                "h-8 max-w-48 truncate rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-input bg-background text-foreground hover:bg-secondary/50",
              )}
              title={option.label}
            >
              {option.label}
            </button>
          );
        })}
        {loading && <span className="flex h-8 items-center px-2 text-xs text-muted-foreground">{tr("fsos360.loading")}</span>}
      </div>
      {isDisabled && reason && (
        <p className="mt-1 text-[11px] text-muted-foreground">{tr(`fsos360.reason.${reason}`)}</p>
      )}
    </div>
  );
}
