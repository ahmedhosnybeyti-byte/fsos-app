import { Injectable } from "@nestjs/common";
import type { DataQualityReport, DataSourceContext } from "@field-sales-os/schemas";
import { SchemaRegistryService } from "../data-source-platform/schema-registry.service";
import { ProviderRegistryService } from "../data-source-platform/providers/provider-registry.service";

interface ColumnDef {
  name: string;
}

// Phase 8 — Import Engine. Per the constitution, it "doesn't know the source
// type, relies entirely on the Data Source Provider." It reads via the
// provider, cross-references the Schema Registry, and produces a Data
// Quality Report.
//
// Interpretation note (documented, not hidden): "load البيانات" (load the
// data) in the constitution's Import Engine responsibilities would mean
// writing FSOS business entities (Customer, Invoice, ...) into their own
// tables. No such entity tables exist within Company Management's bounded
// context — creating them would be exactly the "operational data" /
// "business logic" that every phase so far has explicitly kept out of
// Company Management, and would conflict with "no existing engine is
// migrated in this phase." So for this MVP, Import Engine's "load" step
// stops at validating and counting the *files* that satisfy each expected
// category (via the existing FilesService/classifier, unchanged) — it does
// not create or write any new entity rows. Real row-level import remains a
// separate, future, explicitly-approved initiative alongside the legacy
// engine migration mentioned in the Phase 6/7 conflict report.
@Injectable()
export class ImportEngineService {
  constructor(
    private readonly schemaRegistry: SchemaRegistryService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  async run(context: DataSourceContext): Promise<DataQualityReport> {
    const provider = this.providerRegistry.get(context.provider ?? "");
    const [categorizedFiles, registeredSchemas] = await Promise.all([
      provider.listCategorizedFiles(context.companyId),
      this.schemaRegistry.list(),
    ]);

    const filesByEntity = new Map(categorizedFiles.map((f) => [f.entityName, f]));
    const totalCategories = registeredSchemas.length;

    const matchedCategories: string[] = [];
    const missingFiles: string[] = [];
    const invalidSchema: string[] = [];

    for (const schema of registeredSchemas) {
      const file = filesByEntity.get(schema.entityName);
      if (!file) {
        missingFiles.push(schema.entityName);
        continue;
      }
      matchedCategories.push(schema.entityName);

      const expectedColumns = (schema.expectedColumns as ColumnDef[] | null) ?? [];
      if (expectedColumns.length > 0) {
        const headerSet = new Set(file.headers.map((h) => h.trim().toLowerCase()));
        const missingColumns = expectedColumns.filter((col) => !headerSet.has(col.name.trim().toLowerCase()));
        if (missingColumns.length > 0) invalidSchema.push(schema.entityName);
      }
    }

    const validationScore = totalCategories === 0 ? 1 : matchedCategories.length / totalCategories;

    return {
      totalCategories,
      matchedCategories,
      missingFiles,
      invalidSchema,
      validationScore,
    };
  }
}
