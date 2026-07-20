// Phase 7 — Data Source Provider abstraction. A provider is the only thing
// allowed to know how a given source type actually reads data. Adding a
// future source type (SQL Server, REST API, ...) means adding a new class
// implementing this interface and registering it in ProviderRegistryService
// — never touching ImportEngine, the Refresh Orchestrator, or any consuming
// engine.
//
// MVP note: only `EXCEL_FOLDER` (ExcelFolderProvider) exists, and it is a
// thin wrapper around the *existing* FilesService — it does not introduce a
// new storage mechanism or change how files are uploaded/stored.

export interface CategorizedFileSummary {
  entityName: string; // normalized via FileMappingService, e.g. "CUSTOMERS"
  fileId: string;
  fileName: string;
  rowCount: number | null;
  headers: string[];
  confirmed: boolean;
}

export interface DataSourceProvider {
  readonly code: string; // e.g. "EXCEL_FOLDER"

  // Lists the files currently available for this company under this
  // provider, normalized into FSOS entity categories via File Mapping.
  listCategorizedFiles(companyId: string): Promise<CategorizedFileSummary[]>;
}
