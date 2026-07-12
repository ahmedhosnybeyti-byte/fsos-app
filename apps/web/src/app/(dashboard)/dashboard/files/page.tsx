"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, HelpCircle, Trash2, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CLASSIFICATION_CONFIDENCE, FILE_UPLOAD_LIMITS, SUGGESTED_DATASET_TYPES } from "@field-sales-os/schemas";
import { filesApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";
import type { FileRecord } from "@/lib/types";

export default function FilesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: files, isLoading } = useQuery({ queryKey: ["files"], queryFn: filesApi.list });
  const canManage = user?.role.code === "COMPANY_ADMIN";
  const activeCount = files?.length ?? 0;
  const atLimit = activeCount >= FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany;

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["files"] });
  }

  const removeMutation = useMutation({
    mutationFn: filesApi.remove,
    onSuccess: async () => {
      toast.success("Dataset removed");
      await invalidate();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not remove dataset"),
  });

  async function handleDownload(id: string) {
    try {
      const { url } = await filesApi.downloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not generate download link");
    }
  }

  const pendingCount = files?.filter((f) => !f.datasetTypeConfirmed).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
          <p className="text-muted-foreground">
            Drop in your Excel files — no need to say what they are. Field Sales OS reads the headers and figures it out.
          </p>
        </div>
        <Badge variant="secondary">
          {activeCount} / {FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany} active
        </Badge>
      </div>

      <UploadDropzone atLimit={atLimit} onUploaded={invalidate} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Datasets</CardTitle>
          {pendingCount > 0 && (
            <Badge variant="warning">
              {pendingCount} need{pendingCount === 1 ? "s" : ""} your confirmation
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : !files || files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No datasets uploaded yet. Drop a file above to get started.</p>
          ) : (
            files.map((file) => (
              <DatasetRow key={file.id} file={file} canManage={canManage} onChanged={invalidate} onDownload={handleDownload} onRemove={(id) => removeMutation.mutate(id)} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadDropzone({ atLimit, onUploaded }: { atLimit: boolean; onUploaded: () => Promise<unknown> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);

  async function uploadFiles(fileList: FileList | null) {
    const selected = Array.from(fileList ?? []);
    if (selected.length === 0) return;

    setUploadingCount(selected.length);
    // Each file is uploaded and classified independently, so one bad file
    // in a batch never blocks the others.
    const results = await Promise.allSettled(
      selected.map(async (file) => {
        const record = await filesApi.upload(file);
        if (record.datasetTypeConfirmed) {
          const pct = record.datasetTypeConfidence != null ? ` (${Math.round(record.datasetTypeConfidence)}% confidence)` : "";
          toast.success(`✓ ${file.name} detected as ${record.datasetType}${pct}`);
        } else {
          toast.info(`${file.name} needs a quick confirmation below`);
        }
      }),
    );
    setUploadingCount(0);
    await onUploaded();

    const failed = results.filter((r) => r.status === "rejected");
    failed.forEach((r) => {
      const reason = (r as PromiseRejectedResult).reason;
      toast.error(reason instanceof ApiError ? reason.message : "One of the files failed to upload");
    });
  }

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
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <Upload className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Drag &amp; drop one or more Excel files, or</p>
      <Button type="button" variant="outline" size="sm" disabled={atLimit || uploadingCount > 0} onClick={() => inputRef.current?.click()}>
        {uploadingCount > 0 && <Spinner />}
        {uploadingCount > 0 ? `Classifying ${uploadingCount}…` : "Choose files"}
      </Button>
      {atLimit && <p className="text-xs text-destructive">You&apos;re at the active file limit. Remove one to upload another.</p>}
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
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
  const isMixed = file.parsedMetadata?.classification?.isMixed ?? false;

  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
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
              <Button variant="outline" size="sm" onClick={() => onRemove(file.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <MetadataChips file={file} />

      {!file.datasetTypeConfirmed && isMixed && <MixedWorkbookExplainer file={file} onChanged={onChanged} />}
      {!file.datasetTypeConfirmed && !isMixed && <ConfirmClassification file={file} onChanged={onChanged} />}
    </div>
  );
}

function MetadataChips({ file }: { file: FileRecord }) {
  const detected = file.parsedMetadata?.detected;
  const chips: string[] = [];
  if (file.parsedMetadata) chips.push(`${file.parsedMetadata.rowCount} rows`, `${file.parsedMetadata.headerCount} columns`);
  if (detected?.period) chips.push(`${detected.period.from} → ${detected.period.to}`);
  if (detected?.region?.length) chips.push(`Region: ${detected.region.slice(0, 3).join(", ")}`);
  if (detected?.branch?.length) chips.push(`Branch: ${detected.branch.slice(0, 3).join(", ")}`);
  if (detected?.salesRep?.length) chips.push(`Rep: ${detected.salesRep.slice(0, 3).join(", ")}`);
  if (detected?.route?.length) chips.push(`Route: ${detected.route.slice(0, 3).join(", ")}`);
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
  const variant = status === "READY" ? "success" : status === "FAILED" ? "destructive" : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}

function ConfirmClassification({ file, onChanged }: { file: FileRecord; onChanged: () => Promise<unknown> }) {
  const confidence = file.datasetTypeConfidence ?? 0;
  const isLowConfidence = confidence < CLASSIFICATION_CONFIDENCE.requireConfirmation;
  const [choice, setChoice] = useState(isLowConfidence ? "" : file.datasetType);

  const mutation = useMutation({
    mutationFn: (datasetType: string) => filesApi.confirmType(file.id, datasetType),
    onSuccess: async () => {
      toast.success("Dataset type confirmed");
      await onChanged();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not confirm dataset type"),
  });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-sm">
      {isLowConfidence ? (
        <>
          <HelpCircle className="h-4 w-4 shrink-0 text-warning" />
          <span className="text-muted-foreground">
            Couldn&apos;t confidently classify this one{confidence > 0 ? ` (best guess: ${file.datasetType}, ${Math.round(confidence)}%)` : ""}. What is it?
          </span>
        </>
      ) : (
        <>
          <HelpCircle className="h-4 w-4 shrink-0 text-warning" />
          <span className="text-muted-foreground">
            We think this is <strong className="text-foreground">{file.datasetType}</strong> ({Math.round(confidence)}% confidence).
          </span>
        </>
      )}
      <DatasetTypePicker value={choice} onChange={setChoice} />
      <Button size="sm" disabled={!choice || mutation.isPending} onClick={() => mutation.mutate(choice)}>
        {mutation.isPending && <Spinner />}
        {isLowConfidence ? "Confirm" : "Looks right"}
      </Button>
    </div>
  );
}

function MixedWorkbookExplainer({ file, onChanged }: { file: FileRecord; onChanged: () => Promise<unknown> }) {
  const sheets = file.parsedMetadata?.classification?.sheets ?? [];

  const mutation = useMutation({
    mutationFn: ({ datasetType, sheetIndex }: { datasetType: string; sheetIndex: number }) =>
      filesApi.confirmType(file.id, datasetType, sheetIndex),
    onSuccess: async () => {
      toast.success("Dataset updated");
      await onChanged();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not update dataset"),
  });

  return (
    <div className="mt-3 space-y-2 rounded-md border border-warning/30 bg-warning/5 p-2.5">
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <span className="text-muted-foreground">
          This workbook looks like it has more than one dataset in it. Pick the sheet you want to use as{" "}
          <strong className="text-foreground">{file.fileName}</strong>:
        </span>
      </div>
      <div className="space-y-1.5">
        {sheets.map((sheet) => (
          <div key={sheet.sheetIndex} className="flex flex-wrap items-center justify-between gap-2 rounded bg-background/60 px-2.5 py-1.5 text-sm">
            <span>
              <strong>{sheet.sheetName}</strong>
              <span className="text-muted-foreground">
                {" "}
                — looks like {sheet.topCandidate?.datasetType ?? "an unrecognized dataset"}
                {sheet.topCandidate ? ` (${sheet.topCandidate.confidence}%)` : ""} · {sheet.rowCount} rows
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ datasetType: sheet.topCandidate?.datasetType ?? "Unclassified", sheetIndex: sheet.sheetIndex })
              }
            >
              Use this sheet
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatasetTypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44 text-sm">
        <SelectValue placeholder="Select type…" />
      </SelectTrigger>
      <SelectContent>
        {SUGGESTED_DATASET_TYPES.map((type) => (
          <SelectItem key={type} value={type}>
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
