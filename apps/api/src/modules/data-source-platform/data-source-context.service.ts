import { Injectable } from "@nestjs/common";
import type { DataSourceContext } from "@field-sales-os/schemas";
import { DataSourcesService } from "../data-sources/data-sources.service";
import { ProviderRegistryService } from "./providers/provider-registry.service";

// Phase 7 — Data Source Context. A read-only runtime snapshot built fresh on
// every request that needs it (import/validation/refresh) — never persisted
// as its own table, exactly as the constitution describes it ("created after
// determining Company Context, used during import/update operations").
@Injectable()
export class DataSourceContextService {
  constructor(
    private readonly dataSourcesService: DataSourcesService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async build(companyId: string, dataSourceId: string): Promise<DataSourceContext> {
    const dataSource = await this.dataSourcesService.requireRaw(companyId, dataSourceId);
    return {
      companyId,
      dataSourceId: dataSource.id,
      sourceType: dataSource.type,
      provider: this.providerRegistry.resolveCodeForType(dataSource.type, dataSource.provider),
      schemaVersion: dataSource.schemaVersion,
      healthStatus: dataSource.healthStatus,
    };
  }
}
