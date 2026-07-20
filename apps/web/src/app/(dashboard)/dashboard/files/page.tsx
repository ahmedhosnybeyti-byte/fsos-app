"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, Download, FileSpreadsheet, KeyRound, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FILE_UPLOAD_LIMITS } from "@field-sales-os/schemas";
import { companiesApi, filesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/components/translation-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";
import type { FileProvisioningResult, FileRecord } from "@/lib/types";

// One upload group — every FileRecord sharing a batchId came from the SAME
// physical upload (multi-sheet upload change, 2026-07-19 — see
// files.service.ts's processWorkbook). The Files screen renders one card
// per batch, not one card per entity.
interface FileBatch {
  batchId: string;
  fileName: string;
  files: FileRecord[];
}

function groupIntoBatches(files: FileRecord[] | undefined): FileBatch[] {
  if (!files) return [];
  const order: string[] = [];
  const map = new Map<string, FileRecord[]>();
  for (const file of files) {
    if (!map.has(file.batchId)) order.push(file.batchId);
    const list = map.get(file.batchId) ?? [];
    list.push(file);
    map.set(file.batchId, list);
  }
  return order.map((batchId) => {
    const batchFiles = map.get(batchId)!;
    return { batchId, fileName: batchFiles[0]!.fileName, files: batchFiles };
  });
}

export default function FilesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role.code === "SUPER_ADMIN";
  // SUPER_ADMIN only — which company this session is uploading/listing for.
  // A Super Admin's account belongs to no company, so instead of guessing,
  // the screen requires an explicit target-company choice before anything
  // works (see FilesController.resolveCompanyId). Regular users never see
  // this — their company comes from their own account, full stop.
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  // Employee-account provisioning result from the last upload that produced
  // one (last wins). Held in state — NOT react-query — because the temp
  // passwords inside exist only in that one upload response (show-once, the
  // backend keeps only a hash); once dismissed they are gone for good.
  const [provisioning, setProvisioning] = useState<FileProvisioningResult | null>(null);
  const { data: companiesPage } = useQuery({
    queryKey: ["companies", "picker"],
    queryFn: () => companiesApi.list(1, 100),
    enabled: isSuperAdmin,
  });
  const effectiveCompanyId = isSuperAdmin ? targetCompanyId : undefined;
  const { data: files, isLoading } = useQuery({
    queryKey: ["files", effectiveCompanyId ?? "own"],
    queryFn: () => filesApi.list(effectiveCompanyId),
    enabled: !isSuperAdmin || !!targetCompanyId,
  });
  const canManage = user?.role.code === "COMPANY_ADMIN";
  // Grouped by batchId — the active-upload limit counts distinct physical
  // uploads now, not individual entity rows (a single 18-sheet master file
  // is still just ONE upload). See FilesService.countActiveBatches.
  const batches = useMemo(() => groupIntoBatches(files), [files]);
  const activeCount = batches.length;
  const atLimit = activeCount >= FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany;

  function invalidate() {
    // Prefix match — covers both the "own" key and any per-company key.
    return queryClient.invalidateQueries({ queryKey: ["files"] });
  }

  const removeMutation = useMutation({
    mutationFn: filesApi.remove,
    onSuccess: async () => {
      toast.success(t("files.deleteSuccess"));
      await invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("files.deleteError")),
  });

  async function handleDownload(id: string) {
    try {
      const { url } = await filesApi.downloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t("files.downloadUrlError"));
    }
  }

  return (
    <div className="relative space-y-6">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="rise-in flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="crystal-badge hidden h-14 w-14 shrink-0 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)] sm:flex">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("files.title")}</h1>
            <p className="text-muted-foreground">{t("files.subtitle")}</p>
          </div>
        </div>
        <span
          className={`flex h-9 items-center rounded-full px-4 text-sm font-medium ${atLimit ? "glow-warning text-warning" : "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"}`}
        >
          {t("files.activeCount", { active: activeCount, max: FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany })}
        </span>
      </div>

      {isSuperAdmin && (
        <div className="glass-card rise-in rise-d1 flex flex-wrap items-center gap-3 p-4">
          <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <label htmlFor="target-company" className="text-sm font-medium">
            {t("files.targetCompanyLabel")}
          </label>
          <select
            id="target-company"
            className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
            value={targetCompanyId}
            onChange={(e) => setTargetCompanyId(e.target.value)}
          >
            <option value="">{t("files.targetCompanyPlaceholder")}</option>
            {(companiesPage?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {!targetCompanyId && <p className="text-xs text-muted-foreground">{t("files.targetCompanyHint")}</p>}
        </div>
      )}

      <UploadDropzone
        atLimit={atLimit}
        disabled={isSuperAdmin && !targetCompanyId}
        targetCompanyId={effectiveCompanyId}
        onUploaded={invalidate}
        onProvisioned={setProvisioning}
      />

      {provisioning && provisioning.created.length > 0 && (
        <ProvisioningPanel provisioning={provisioning} onDismiss={() => setProvisioning(null)} />
      )}

      <div className="glass-card rise-in rise-d2 p-6">
        <div className="flex flex-row items-center justify-between">
          <h3 className="flex items-center gap-2.5 text-base font-semibold leading-none tracking-tight">
            <span className="crystal-badge h-9 w-9 bg-primary/15 text-primary">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            {t("files.uploadedFiles")}
          </h3>
        </div>
        <div className="mt-4 space-y-3">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("files.empty")}</p>
          ) : (
            batches.map((batch) => (
              <FileBatchCard
                key={batch.batchId}
                batch={batch}
                canManage={canManage}
                onChanged={invalidate}
                onDownload={handleDownload}
                onRemove={(id) => removeMutation.mutate(id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function UploadDropzone({
  atLimit,
  disabled = false,
  targetCompanyId,
  onUploaded,
  onProvisioned,
}: {
  atLimit: boolean;
  // SUPER_ADMIN with no target company picked yet — uploads blocked until
  // one is chosen, so nothing can ever land in the wrong company.
  disabled?: boolean;
  targetCompanyId?: string;
  onUploaded: () => Promise<unknown>;
  // An accepted Employees sheet also provisions platform accounts — the
  // parent surfaces the result (with its show-once temp passwords) in a
  // panel that outlives this upload run.
  onProvisioned: (result: FileProvisioningResult) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Every named sheet is matched against the closest FSOS Import Template
  // and validated against it (ADR-001 §2, full enforcement) — there is no
  // manual confirm/mapping step left. A single physical upload can contain
  // up to 18 canonical entities across sheets (2026-07-19); each named
  // sheet either passes and lands in `accepted`, or fails and lands in
  // `rejected` — never blocking the rest of the sheets. Sheets not named
  // after any official entity land in `ignored` (not an error, no toast
  // needed for those). The one exception the backend keeps for backward
  // compat: a single-sheet upload whose one sheet fails outright still
  // throws the pre-existing HTTP 422 + ApiError.errors = ValidationReport
  // (see files.controller.ts's upload endpoint / files.service.ts's
  // uploadFile) — handled unchanged in the catch branch below.
  async function uploadFiles(fileList: FileList | null) {
    if (disabled) {
      toast.error(t("files.targetCompanyHint"));
      return;
    }
    const selected = Array.from(fileList ?? []);
    if (selected.length === 0) return;

    setUploadingCount(selected.length);
    await Promise.allSettled(
      selected.map(async (file) => {
        try {
          const result = await filesApi.upload(file, targetCompanyId);
          const attempted = result.accepted.length + result.rejected.length;

          if (result.accepted.length > 0) {
            const names = result.accepted.map((f) => f.datasetType);
            const shown = names.slice(0, 6);
            const extra = names.length > shown.length ? t("files.batchAcceptedMore", { count: names.length - shown.length }) : "";
            toast.success(
              t("files.batchAccepted", {
                fileName: file.name,
                accepted: result.accepted.length,
                attempted,
                entities: extra ? `${shown.join(", ")} ${extra}` : shown.join(", "),
              }),
            );
          }

          if (result.provisioning && (result.provisioning.created.length > 0 || result.provisioning.skipped.length > 0)) {
            onProvisioned(result.provisioning);
          }

          if (result.rejected.length > 0) {
            const details = result.rejected
              .map((r) => `${r.entity}: ${r.report?.issues[0]?.message ?? r.message ?? "?"}`)
              .join(" | ");
            toast.error(t("files.batchRejected", { fileName: file.name, count: result.rejected.length, details }));
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 422 && error.errors) {
            const report = error.errors as { entity?: string; errorCount?: number; issues?: { message: string }[] };
            toast.error(
              t("files.validationRejected", {
                fileName: file.name,
                entity: report.entity ?? "?",
                count: report.errorCount ?? 0,
                detail: report.issues?.[0]?.message ?? "",
              }),
            );
          } else {
            toast.error(error instanceof ApiError ? `${file.name}: ${error.message}` : t("files.uploadFailed"));
          }
        }
      }),
    );
    setUploadingCount(0);
    await onUploaded();
  }

  // This dropzone is the primary action on the Files screen (the reason
  // someone comes here at all), so it gets the Hero glass treatment
  // (§14.6 — reserved for the single primary element on a screen) instead
  // of a plain dashed box, mirroring how the Dashboard reserves .glass-hero
  // for its own primary element.
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        uploadFiles(e.dataTransfer.files);
      }}
      className={`glass-hero rise-in rise-d1 relative flex flex-col items-center justify-center gap-3 border-dashed p-10 text-center transition-colors ${
        dragOver ? "border-primary" : ""
      }`}
    >
      <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
      <span className="crystal-badge relative h-16 w-16 bg-primary/15 text-primary drop-shadow-[0_0_24px_hsl(var(--primary)/0.4)]">
        <Upload className="h-7 w-7" />
      </span>
      <p className="relative text-sm text-muted-foreground">{t("files.dropzoneText")}</p>
      <Button
        type="button"
        size="lg"
        className="relative h-11 px-6 shadow-[0_0_28px_-8px_hsl(var(--primary)/0.5)]"
        disabled={atLimit || disabled || uploadingCount > 0}
        onClick={() => inputRef.current?.click()}
      >
        {uploadingCount > 0 && <Spinner />}
        {uploadingCount > 0 ? t("files.classifying", { count: uploadingCount }) : t("files.chooseFiles")}
      </Button>
      {atLimit && <p className="relative text-xs text-destructive">{t("files.atLimit")}</p>}
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
    </div>
  );
}

// Show-once temp-password panel — an accepted Employees sheet provisions
// platform accounts, and the response is the ONLY place the temp passwords
// ever appear in plaintext (the backend stores only a hash). This panel
// stays up until the admin explicitly dismisses it, and the dismiss label
// spells out that there's no way back.
function ProvisioningPanel({ provisioning, onDismiss }: { provisioning: FileProvisioningResult; onDismiss: () => void }) {
  const { t } = useTranslation();
  const skippedShown = provisioning.skipped.slice(0, 5);
  const skippedExtra = provisioning.skipped.length - skippedShown.length;

  async function handleCopyAll() {
    const lines = provisioning.created.map((a) => `${a.fullName}\t${a.email}\t${a.tempPassword}`).join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      toast.success(t("files.provisionCopied"));
    } catch {
      // Clipboard can be unavailable (permissions / non-secure context) —
      // the passwords are still on screen for manual copying, so no toast.
    }
  }

  return (
    <div className="glass-card rise-in rise-d1 border border-warning/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="crystal-badge h-9 w-9 shrink-0 bg-warning/15 text-warning">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-none tracking-tight">{t("files.provisionTitle")}</h3>
            <p className="mt-1.5 text-xs font-medium text-warning">{t("files.provisionWarning")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyAll}>
            <Copy className="h-4 w-4" />
            {t("files.provisionCopyAll")}
          </Button>
          <Button variant="outline" size="sm" onClick={onDismiss}>
            {t("files.provisionDismiss")}
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground dark:border-white/[0.06]">
              <th className="py-2 pe-4 text-start font-medium">{t("files.provisionName")}</th>
              <th className="py-2 pe-4 text-start font-medium">{t("files.provisionEmail")}</th>
              <th className="py-2 pe-4 text-start font-medium">{t("files.provisionRole")}</th>
              <th className="py-2 text-start font-medium">{t("files.provisionPassword")}</th>
            </tr>
          </thead>
          <tbody>
            {provisioning.created.map((account) => (
              <tr key={account.email} className="border-b border-border/40 last:border-0 dark:border-white/[0.04]">
                <td className="py-2 pe-4">{account.fullName}</td>
                <td className="py-2 pe-4">
                  <span dir="ltr">{account.email}</span>
                </td>
                <td className="py-2 pe-4">
                  <Badge variant="outline">{account.roleCode}</Badge>
                </td>
                <td className="py-2">
                  <span dir="ltr" className="font-mono">
                    {account.tempPassword}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {provisioning.updatedCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{t("files.provisionUpdatedCount", { count: provisioning.updatedCount })}</p>
      )}
      {provisioning.skipped.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <p>{t("files.provisionSkippedCount", { count: provisioning.skipped.length })}</p>
          {skippedShown.map((reason, i) => (
            <p key={i}>• {reason}</p>
          ))}
          {skippedExtra > 0 && <p>{t("files.batchAcceptedMore", { count: skippedExtra })}</p>}
        </div>
      )}
    </div>
  );
}

// One card per physical upload (batch), holding every entity that batch
// produced. A single-sheet upload is a "batch of one" and just renders as
// a card with one nested entity row, same visual weight as before.
function FileBatchCard({
  batch,
  canManage,
  onChanged,
  onDownload,
  onRemove,
}: {
  batch: FileBatch;
  canManage: boolean;
  onChanged: () => Promise<unknown>;
  onDownload: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{batch.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatDate(batch.files[0]!.createdAt)}</p>
          </div>
        </div>
        <Badge variant="outline">{t("files.batchEntitiesCount", { count: batch.files.length })}</Badge>
      </div>

      <div className="mt-3 space-y-2 border-t border-border/60 pt-3 dark:border-white/[0.06]">
        {batch.files.map((file) => (
          <DatasetRow key={file.id} file={file} canManage={canManage} onChanged={onChanged} onDownload={onDownload} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function DatasetRow({
  file,
  canManage,
  onChanged,
  onDownload,
  onRemove,
}: {
  file: FileRecord;
  canManage: boolean;
  onChanged: () => Promise<unknown>;
  onDownload: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 backdrop-blur-sm transition-colors dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatDate(file.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{file.datasetType}</Badge>
          <StatusBadge status={file.status} />
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => onDownload(file.id)}>
                <Download className="h-4 w-4" />
              </Button>
              <ReplaceFileButton fileId={file.id} onChanged={onChanged} />
              <Button variant="outline" size="sm" onClick={() => onRemove(file.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <MetadataChips file={file} />
    </div>
  );
}

// "استبدال ملف" — lets the admin re-upload a daily/recurring export as the
// new version of an existing file, carrying over its SGI file selection
// instead of redoing that one-time setup on every upload (see
// FilesService.replaceFile). The replacement goes through the same strict
// Import Validation gate as any upload, and must match the same canonical
// entity as the file it's replacing.
function ReplaceFileButton({ fileId, onChanged }: { fileId: string; onChanged: () => Promise<unknown> }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => filesApi.replace(fileId, file),
    onSuccess: async (result) => {
      await onChanged();
      const base = result.carryOver?.sgiConfigUpdated
        ? t("files.replaceSuccessWithCarryOver", { parts: t("files.carryOverSgi") })
        : t("files.replaceSuccess");
      const otherAccepted = result.otherAccepted.length > 0 ? ` ${t("files.replaceOtherAccepted", { count: result.otherAccepted.length })}` : "";
      toast.success(`${base}${otherAccepted}`);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("files.replaceError")),
  });

  return (
    <>
      <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => inputRef.current?.click()} title={t("files.replaceFileTitle")}>
        {mutation.isPending ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutation.mutate(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

function MetadataChips({ file }: { file: FileRecord }) {
  const { t } = useTranslation();
  const detected = file.parsedMetadata?.detected;
  const chips: string[] = [];
  if (file.parsedMetadata)
    chips.push(
      t("files.rowCountChip", { count: file.parsedMetadata.rowCount }),
      t("files.columnCountChip", { count: file.parsedMetadata.headerCount }),
    );
  if (detected?.period) chips.push(t("files.periodChip", { from: detected.period.from, to: detected.period.to }));
  if (detected?.region?.length) chips.push(t("files.regionChip", { values: detected.region.slice(0, 3).join(", ") }));
  if (detected?.branch?.length) chips.push(t("files.branchChip", { values: detected.branch.slice(0, 3).join(", ") }));
  if (detected?.salesRep?.length) chips.push(t("files.salesRepChip", { values: detected.salesRep.slice(0, 3).join(", ") }));
  if (detected?.route?.length) chips.push(t("files.routeChip", { values: detected.route.slice(0, 3).join(", ") }));
  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip, i) => (
        <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          {chip}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: FileRecord["status"] }) {
  const { t } = useTranslation();
  const STATUS_LABELS: Record<FileRecord["status"], string> = {
    READY: t("files.statusReady"),
    FAILED: t("files.statusFailed"),
    PROCESSING: t("files.statusProcessing"),
  };
  const variant = status === "READY" ? "success" : status === "FAILED" ? "destructive" : "warning";
  return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}
