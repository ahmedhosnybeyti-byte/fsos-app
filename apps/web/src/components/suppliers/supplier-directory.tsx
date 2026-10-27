"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { Text } from "../wms/shared";
import { SupplierPicker } from "./supplier-picker";

export function SupplierDirectory({ warehouse, company, t }: { warehouse: string; company: string; t: Text }) {
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(null);
  return <Card><CardContent className="pt-4 sm:pt-6"><details><summary className="cursor-pointer rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {t("suppliers.master.directory" as Parameters<Text>[0])}</summary><div className="mt-4"><SupplierPicker warehouse={warehouse} company={company} value={supplier?.id ?? ""}
      currentName={supplier?.name} onChoose={setSupplier} t={t} /></div></details></CardContent></Card>;
}
