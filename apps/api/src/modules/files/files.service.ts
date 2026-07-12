import { BadRequestException, Injectable, Logger, NotFoundException, Inject } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import type { Prisma } from "@field-sales-os/database";
import { CLASSIFICATION_CONFIDENCE, FILE_UPLOAD_LIMITS } from "@field-sales-os/schemas";
import { PrismaService } from "../../common/prisma";
import { AuditLogService } from "../audit-log/audit-log.service";
import { STORAGE_PROVIDER, type StorageProvider } from "./storage/storage-provider.interface";
import { DatasetClassifierService } from "./classification/dataset-classifier.service";
import type { SheetClassification } from "./classification/types";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-100);
}

// datasetType may be platform-detected or user-provided either way; it
// becomes part of the object storage key below, so it's sanitized the same
// way as a filename regardless of where it came from.
function sanitizeDatasetType(datasetType: string): string {
  const cleaned = datasetType.replace(/[^a-zA-Z0-9.\-_ ]/g, "_").trim();
  return (cleaned || "dataset").slice(0, 60);
}

function buildParsedMetadata(sheetNames: string[], sheet: SheetClassification, isMixed: boolean, allSheets: SheetClassification[]) {
  return {
    sheetNames,
    rowCount: sheet.rowCount,
    headers: sheet.headers,
    headerCount: sheet.headers.length,
    // Metadata Layer (Sprint 2.2): per-column type/shape + the Smart
    // Metadata below, both surfaced to the GPT via GptService's
    // toDatasetSummary — see dataset-classifier.service.ts for how each is
    // computed.
    columns: sheet.columns,
    classification: {
      candidates: sheet.candidates,
      isMixed,
      // Only present when mixed — lets the UI explain what's on each sheet
      // without forcing the user to inspect the workbook themselves.
      sheets: isMixed
        ? allSheets.map((s) => ({
            sheetIndex: s.sheetIndex,
            sheetName: s.sheetName,
            topCandidate: s.candidates[0] ?? null,
            rowCount: s.rowCount,
            headerCount: s.headers.length,
          }))
        : undefined,
    },
    detected: sheet.detected,
  };
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly classifier: DatasetClassifierService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private validateUpload(file: Express.Multer.File) {
    if (!FILE_UPLOAD_LIMITS.allowedMimeTypes.includes(file.mimetype as (typeof FILE_UPLOAD_LIMITS.allowedMimeTypes)[number])) {
      throw new BadRequestException("Only .xlsx or .xls files are allowed");
    }
    if (file.size > FILE_UPLOAD_LIMITS.maxFileSizeBytes) {
      throw new BadRequestException(`File exceeds the ${FILE_UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024)}MB limit`);
    }
  }

  // The user never picks a dataset type up front — the platform inspects
  // the workbook (headers, sheet name, sample data shape) and classifies it.
  // >=90% confidence: auto-assigned, no action needed. 60-90%: stored with
  // a best guess pending a one-click confirm. <60% or a mixed workbook:
  // stored pending a manual decision. Any authenticated company member may
  // upload — datasets are business data sources, not organizational-role
  // slots, so there is no per-role upload restriction.
  async uploadFile(params: { companyId: string; uploadedByUserId: string; file: Express.Multer.File }) {
    const { companyId, uploadedByUserId, file } = params;

    this.validateUpload(file);

    const activeCount = await this.prisma.file.count({ where: { companyId, isActive: true } });
    if (activeCount >= FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany) {
      throw new BadRequestException(
        `Your company already has ${FILE_UPLOAD_LIMITS.maxActiveFilesPerCompany} active files. Remove one before uploading another.`,
      );
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true });
    } catch {
      throw new BadRequestException("Could not read this file — is it a valid .xlsx or .xls workbook?");
    }

    const classification = this.classifier.classifyWorkbook(workbook);
    const primarySheet = classification.sheets[classification.primarySheetIndex];
    const topCandidate = primarySheet?.candidates[0];
    const confidence = topCandidate?.confidence ?? 0;
    const bestGuessType = topCandidate && confidence > 0 ? topCandidate.datasetType : "Unclassified";
    const confirmed = !classification.isMixed && confidence >= CLASSIFICATION_CONFIDENCE.autoAssign;

    const safeDatasetType = sanitizeDatasetType(bestGuessType);
    const storageKey = `${companyId}/${safeDatasetType}/${Date.now()}-${randomBytes(4).toString("hex")}-${sanitizeFileName(file.originalname)}`;

    const fileRecord = await this.prisma.file.create({
      data: {
        companyId,
        uploadedByUserId,
        datasetType: bestGuessType,
        datasetTypeConfidence: confidence,
        datasetTypeConfirmed: confirmed,
        sheetIndex: primarySheet?.sheetIndex ?? 0,
        fileName: file.originalname,
        storageKey,
        sizeBytes: file.size,
        status: "PROCESSING",
      },
    });

    try {
      await this.storage.upload({ key: storageKey, body: file.buffer, contentType: file.mimetype });

      const metadata = primarySheet
        ? buildParsedMetadata(workbook.SheetNames, primarySheet, classification.isMixed, classification.sheets)
        : { sheetNames: workbook.SheetNames, rowCount: 0, headers: [], headerCount: 0, columns: [] };

      const updated = await this.prisma.file.update({
        where: { id: fileRecord.id },
        data: { status: "READY", parsedMetadata: metadata as unknown as Prisma.InputJsonValue },
      });

      await this.auditLogService.record({
        companyId,
        userId: uploadedByUserId,
        action: "files.upload",
        entityType: "File",
        entityId: fileRecord.id,
        metadata: { datasetType: bestGuessType, confidence, isMixed: classification.isMixed, fileName: file.originalname },
      });

      return updated;
    } catch (err) {
      this.logger.error(`Failed to process upload ${fileRecord.id}`, err instanceof Error ? err.stack : undefined);
      await this.prisma.file.update({ where: { id: fileRecord.id }, data: { status: "FAILED" } });
      throw new BadRequestException("Could not process the uploaded file. Please check the file format and try again.");
    }
  }

  // Finalizes an ambiguous classification: accepting the platform's
  // suggestion, overriding it manually, or — for a mixed workbook —
  // choosing which sheet's data this File actually represents.
  async confirmDatasetType(
    id: string,
    companyId: string,
    confirmedByUserId: string,
    datasetType: string,
    sheetIndex?: number,
  ) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");

    const targetSheetIndex = sheetIndex ?? file.sheetIndex;
    let parsedMetadata = file.parsedMetadata as Prisma.InputJsonValue | null;

    if (targetSheetIndex !== file.sheetIndex) {
      const buffer = await this.storage.download(file.storageKey);
      const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const classification = this.classifier.classifyWorkbook(workbook);
      const sheet = classification.sheets[targetSheetIndex];
      if (!sheet) throw new BadRequestException("Invalid sheet selection");
      parsedMetadata = buildParsedMetadata(
        workbook.SheetNames,
        sheet,
        classification.isMixed,
        classification.sheets,
      ) as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.file.update({
      where: { id },
      data: {
        datasetType,
        datasetTypeConfirmed: true,
        sheetIndex: targetSheetIndex,
        parsedMetadata: parsedMetadata ?? undefined,
      },
    });

    await this.auditLogService.record({
      companyId,
      userId: confirmedByUserId,
      action: "files.confirm_dataset_type",
      entityType: "File",
      entityId: id,
      metadata: { datasetType, sheetIndex: targetSheetIndex },
    });

    return updated;
  }

  listActiveForCompany(companyId: string) {
    return this.prisma.file.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  // Used by GptModule's dataset Action endpoint — the model picks a specific
  // fileId from the active-datasets list (verify-access / GET /gpt/datasets)
  // rather than a "type", since multiple files can share a datasetType.
  // Unconfirmed classifications are excluded: the AI should never analyze a
  // dataset the platform itself hasn't finished labeling correctly.
  listConfirmedActiveForCompany(companyId: string) {
    return this.prisma.file.findMany({
      where: { companyId, isActive: true, status: "READY", datasetTypeConfirmed: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findActiveById(companyId: string, fileId: string) {
    return this.prisma.file.findFirst({
      where: { id: fileId, companyId, isActive: true, status: "READY", datasetTypeConfirmed: true },
    });
  }

  async deactivate(id: string, companyId: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");
    return this.prisma.file.update({ where: { id }, data: { isActive: false } });
  }

  async getDownloadUrl(id: string, companyId: string): Promise<string> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");
    return this.storage.getSignedDownloadUrl(file.storageKey);
  }

  // Used by GptModule's dataset Action endpoint to read the actual workbook
  // bytes for parsing (as opposed to getDownloadUrl, which is for humans).
  async downloadFileBuffer(id: string, companyId: string): Promise<Buffer> {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.companyId !== companyId) throw new NotFoundException("File not found");
    return this.storage.download(file.storageKey);
  }
}
