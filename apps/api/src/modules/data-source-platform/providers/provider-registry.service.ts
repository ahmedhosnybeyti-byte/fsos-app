import { Injectable, NotFoundException } from "@nestjs/common";
import { ExcelFolderProvider } from "./excel-folder.provider";
import type { DataSourceProvider } from "./data-source-provider.interface";

// A DataSource's Phase 6 `type` (e.g. "EXCEL_FILE") is a fine-grained
// connection type; a Data Source Provider is coarser (multiple types can
// share one provider). This map lets `provider` stay auto-derived from the
// existing `type` field for the MVP instead of requiring users to fill in a
// brand-new manual field — one more future provider = one more map entry.
const TYPE_TO_PROVIDER: Record<string, string> = {
  EXCEL_FILE: "EXCEL_FOLDER",
  CSV_FILE: "EXCEL_FOLDER",
};

// Maps a Data Source Provider code to its implementation. Adding a future
// provider (SQL Server, REST API, ...) is registering one more entry here —
// never a change to ImportEngine or the Refresh Orchestrator.
@Injectable()
export class ProviderRegistryService {
  private readonly providers: Map<string, DataSourceProvider>;

  constructor(excelFolderProvider: ExcelFolderProvider) {
    this.providers = new Map([[excelFolderProvider.code, excelFolderProvider]]);
  }

  get(code: string): DataSourceProvider {
    const provider = this.providers.get(code);
    if (!provider) throw new NotFoundException(`No Data Source Provider registered for "${code}"`);
    return provider;
  }

  resolveCodeForType(type: string, explicitProvider?: string | null): string | null {
    return explicitProvider ?? TYPE_TO_PROVIDER[type] ?? null;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
