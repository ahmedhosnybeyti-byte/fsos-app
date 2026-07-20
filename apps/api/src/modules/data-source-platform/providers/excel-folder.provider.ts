import { Injectable } from "@nestjs/common";
import { FilesService } from "../../files/files.service";
import { toSchemaEntityName } from "../file-mapping.util";
import type { CategorizedFileSummary, DataSourceProvider } from "./data-source-provider.interface";

interface ParsedMetadataShape {
  rowCount?: number;
  headers?: string[];
}

// MVP's only Data Source Provider. Wraps FilesService.listConfirmedActiveForCompany
// verbatim — same query, same data, same behavior as every existing engine
// that reads company files today. This provider does not read file bytes or
// re-parse XLSX itself; it only reuses the classification metadata FilesService
// already produces, so it cannot diverge from what's actually stored.
@Injectable()
export class ExcelFolderProvider implements DataSourceProvider {
  readonly code = "EXCEL_FOLDER";

  constructor(private readonly filesService: FilesService) {}

  async listCategorizedFiles(companyId: string): Promise<CategorizedFileSummary[]> {
    const files = await this.filesService.listConfirmedActiveForCompany(companyId);
    return files.map((file) => {
      const metadata = (file.parsedMetadata as ParsedMetadataShape | null) ?? {};
      return {
        entityName: toSchemaEntityName(file.datasetType),
        fileId: file.id,
        fileName: file.fileName,
        rowCount: metadata.rowCount ?? null,
        headers: metadata.headers ?? [],
        confirmed: file.datasetTypeConfirmed,
      };
    });
  }
}
