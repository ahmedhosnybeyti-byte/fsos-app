"use client";

import { useState } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { decisionAnalyticsStudioApi } from "@/lib/api";
import type { DecisionFilterField } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// A dedicated multi-select checkbox dropdown, local to Decision Analytics
// Studio (built here rather than extending the shared ui/dropdown-menu.tsx
// primitive, per the "do not modify other screens" scope constraint — this
// is additive-only and touches nothing any other screen imports). Options
// are lazily fetched from GET /decision-analytics-studio/filter-options the
// first time a given field's dropdown is opened, then cached by TanStack
// Query's normal queryKey caching — so a viewer who never opens the
// Representative dropdown never pays for that lookup.
export function MultiSelectFilter({
  field,
  label,
  selected,
  onChange,
}: {
  field: DecisionFilterField;
  label: string;
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["decision-analytics-studio", "filter-options", field],
    queryFn: () => decisionAnalyticsStudioApi.filterOptions(field),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const options = optionsQuery.data?.options ?? [];

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-secondary/40",
            selected.length > 0 && "border-primary/50 bg-primary/5",
          )}
        >
          <span>{label}</span>
          {selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">{selected.length}</span>}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {optionsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
            </div>
          ) : options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">—</p>
          ) : (
            <>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mb-1 w-full rounded-sm px-2 py-1 text-start text-xs text-primary hover:bg-secondary/60"
                >
                  ×
                </button>
              )}
              {options.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-secondary/60"
                  >
                    <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-input", isSelected && "border-primary bg-primary")}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
