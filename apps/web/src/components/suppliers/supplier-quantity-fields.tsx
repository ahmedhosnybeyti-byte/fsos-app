"use client";
import { Input } from "@/components/ui/input";
import { Field, unitLabel, type Text } from "../wms/shared";
import { toBaseQuantity, type CartonPieces } from "./supplier-quantities";

export type QuantityDraft = CartonPieces & { base: string };
export const zeroQuantity = (): QuantityDraft => ({ cartons: "0", pieces: "0", base: "0" });
export function draftValue(value: QuantityDraft, baseUnit: string, factor: number): string | null {
  return baseUnit === "PIECE" ? toBaseQuantity(value, factor) : value.base;
}
export function SupplierQuantityFields({ id, label, value, onChange, baseUnit, factor, t }: {
  id: string; label: string; value: QuantityDraft; onChange: (value: QuantityDraft) => void;
  baseUnit: string; factor: number; t: Text;
}) {
  return <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-medium">{label}</legend>
    {baseUnit === "PIECE" ? <><div className="grid grid-cols-2 gap-2">
      <Field id={id + "-cartons"} label={t("wms.carton")}><Input id={id + "-cartons"} dir="ltr" inputMode="numeric" pattern="[0-9]+" required value={value.cartons} onChange={e => onChange({ ...value, cartons: e.target.value })} /></Field>
      <Field id={id + "-pieces"} label={t("wms.piece")}><Input id={id + "-pieces"} dir="ltr" inputMode="numeric" pattern="[0-9]+" required value={value.pieces} onChange={e => onChange({ ...value, pieces: e.target.value })} /></Field>
    </div><p className="text-xs text-muted-foreground">{t("wms.carton")} = <bdi>{factor}</bdi> {t("wms.piece")} · <bdi>{draftValue(value, baseUnit, factor) ?? "—"}</bdi> {t("wms.piece")}</p></>
      : <Field id={id + "-base"} label={unitLabel(baseUnit, t)}><Input id={id + "-base"} dir="ltr" inputMode="decimal" required value={value.base} onChange={e => onChange({ ...value, base: e.target.value })} /></Field>}
  </fieldset>;
}
