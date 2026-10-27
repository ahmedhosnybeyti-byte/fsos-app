"use client";
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasOperationalPermissions } from "@field-sales-os/schemas";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supplierMasterApi, type SupplierIdentity } from "@/lib/api/supplier-master";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBox, Field, Pager, type Text } from "../wms/shared";
import { operationQueryOptions } from "../wms/operation-editors";

export interface SupplierPickerProps {
  warehouse: string; company: string; value: string; currentName?: string;
  onChoose: (supplier: SupplierIdentity) => void; t: Text; disabled?: boolean;
}
export function SupplierPicker({ warehouse, company, value, currentName, onChoose, t, disabled = false }: SupplierPickerProps) {
  const id = useId(), { user } = useAuth(), client = useQueryClient();
  const [input, setInput] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false), [code, setCode] = useState(""), [name, setName] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID()), [invalid, setInvalid] = useState(false);
  const [chosen, setChosen] = useState<SupplierIdentity | null>(null);
  const canCreate = !!user && user.role.code !== "COMPANY_ADMIN" && hasOperationalPermissions(user.role.code, user.permissions, ["sfa.access", "wms.read", "wms.receiving.create"]);
  const queryKey = ["wms", company, warehouse, "supplier-master"];
  const suppliers = useQuery({ queryKey: [...queryKey, page, search], queryFn: () => supplierMasterApi.list(warehouse, page, search),
    enabled: !disabled, ...operationQueryOptions });
  const choose = (supplier: SupplierIdentity) => { setChosen(supplier); onChoose(supplier); };
  const create = useMutation({ mutationFn: () => supplierMasterApi.create(warehouse, { code: code.trim(), name: name.trim(), idempotencyKey: key }),
    onSuccess: async supplier => { choose(supplier); setCreating(false); setCode(""); setName(""); setKey(crypto.randomUUID());
      await client.invalidateQueries({ queryKey }); } });
  const selectedName = chosen?.id === value ? chosen.name : currentName;
  const text = (key: string) => t(key as Parameters<Text>[0]);
  function save() {
    const valid = /^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code.trim()) && name.trim().length > 0 && name.trim().length <= 160;
    setInvalid(!valid); if (valid) create.mutate();
  }
  return <section className="min-w-0 space-y-3" aria-label={t("wms.supplier")}>
    {selectedName && <p role="status" className="glass-surface break-words p-3 text-sm"><span className="text-muted-foreground">{text("suppliers.master.selected")}: </span><strong>{selectedName}</strong></p>}
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1"><Field id={`${id}-search`} label={text("suppliers.master.search")}><Input id={`${id}-search`} value={input} maxLength={80}
        disabled={disabled || create.isPending} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setSearch(input.trim()); setPage(1); } }} /></Field></div>
      <Button type="button" variant="outline" disabled={disabled || create.isPending} onClick={() => { setSearch(input.trim()); setPage(1); }}>{t("wms.search")}</Button>
      {canCreate && <Button type="button" variant="outline" disabled={disabled || create.isPending} aria-expanded={creating} onClick={() => setCreating(open => !open)}><Plus className="h-4 w-4" />{text("suppliers.master.new")}</Button>}
    </div>
    {creating && canCreate && <section className="glass-surface space-y-3 p-3" aria-label={text("suppliers.master.new")}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (!disabled && !create.isPending) save(); } }}>
      <div className="grid gap-3 sm:grid-cols-2"><Field id={`${id}-code`} label={text("suppliers.master.code")}><Input id={`${id}-code`} dir="ltr" maxLength={20} value={code} disabled={disabled || create.isPending} onChange={event => { setCode(event.target.value.toUpperCase()); setKey(crypto.randomUUID()); }} /></Field>
        <Field id={`${id}-name`} label={text("suppliers.master.name")}><Input id={`${id}-name`} maxLength={160} value={name} disabled={disabled || create.isPending} onChange={event => { setName(event.target.value); setKey(crypto.randomUUID()); }} /></Field></div>
      <p className="text-xs text-muted-foreground">{text("suppliers.master.codeHint")}</p>
      {invalid && <p role="alert" className="text-sm text-destructive">{text("suppliers.master.invalid")}</p>}
      {create.isError && <ErrorBox error={create.error} t={t} />}
      <Button type="button" disabled={disabled || create.isPending} onClick={save}>{create.isPending ? t("wms.saving") : text("suppliers.master.save")}</Button>
    </section>}
    {!disabled && (suppliers.isPending ? <Skeleton className="h-20" /> : suppliers.isError ? <ErrorBox error={suppliers.error} retry={() => void suppliers.refetch()} t={t} />
      : <><div className="grid gap-2 sm:grid-cols-2">{suppliers.data.items.map(supplier => <Button type="button" key={supplier.id} variant={value === supplier.id ? "default" : "outline"}
        className="h-auto min-w-0 justify-start whitespace-normal py-3 text-start" aria-pressed={value === supplier.id} disabled={create.isPending} onClick={() => choose(supplier)}>
        <span className="min-w-0 break-words">{supplier.name} · <bdi>{supplier.code}</bdi></span></Button>)}</div>
        {!suppliers.data.items.length && <p className="text-sm text-muted-foreground">{text("suppliers.master.empty")}</p>}
        <Pager page={page} hasMore={suppliers.data.hasMore} busy={suppliers.isFetching || create.isPending} onChange={setPage} t={t} /></>)}
  </section>;
}
