import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { CompaniesModule } from "../companies/companies.module";
import { DataSourcesModule } from "../data-sources/data-sources.module";
import { ExcelFolderProvider } from "./providers/excel-folder.provider";
import { ProviderRegistryService } from "./providers/provider-registry.service";
import { SchemaRegistryService } from "./schema-registry.service";
import { SchemaRegistryController } from "./schema-registry.controller";
import { DataSourceContextService } from "./data-source-context.service";
import { DataSourceValidationService } from "./data-source-validation.service";

// Phase 7 — Data Source Platform. Purely additive: imports the *existing*
// FilesModule/CompaniesModule/DataSourcesModule as dependencies and wraps
// them; does not modify anything inside them, and no existing engine module
// imports anything from here (so nothing existing can be affected even
// transitively).
@Module({
  imports: [FilesModule, CompaniesModule, DataSourcesModule],
  providers: [ExcelFolderProvider, ProviderRegistryService, SchemaRegistryService, DataSourceContextService, DataSourceValidationService],
  controllers: [SchemaRegistryController],
  exports: [ProviderRegistryService, SchemaRegistryService, DataSourceContextService, DataSourceValidationService],
})
export class DataSourcePlatformModule {}
