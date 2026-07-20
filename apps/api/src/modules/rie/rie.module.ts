import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { GraphBuilderService } from "./graph-builder.service";
import { ENTITY_PROVIDER } from "./entity-provider.interface";
import { ExcelDatasetEntityProvider } from "./excel-entity-provider.service";
import { CanonicalHierarchyResolverService } from "./canonical-hierarchy-resolver.service";
import { NavigationEngineService } from "./navigation-engine.service";
import { QueryExecutionEngineService } from "./query-execution-engine.service";
import { BusinessRulesEngineService } from "./business-rules-engine.service";
import { RieFacade } from "./rie-facade.service";

// RIE module — Relationship Intelligence Engine.
//
// Components (see FSOS RIE Constitution vNext, FSOS Relationship Registry
// Specification v1.0, FSOS RIE Query Planner Specification v1.0):
//   1. GraphBuilderService     — builds/validates the Relationship Graph.
//   2. ExcelDatasetEntityProvider — first EntityProvider implementation,
//      reading Canonical Entity data from uploaded Excel datasets (the
//      platform's real system-of-record today). Bound behind the
//      storage-agnostic ENTITY_PROVIDER token; a future PrismaEntityProvider
//      can be swapped in later with zero changes to Navigation Engine or
//      Query Execution Engine — see entity-provider.interface.ts.
//   3. NavigationEngineService — traverses one already-selected relationship
//      (or Multi-Hop chain) at a time via the injected EntityProvider.
//
// Deliberately a leaf-facing module with no controller: RIE's Golden Rule
// (RIE Constitution, Phase 10) is that it is the only authority for
// discovering/navigating/exposing relationships, and it is never exposed as
// a direct HTTP surface — only future internal consumers (Query Execution
// Engine, Business Rules Engine, and eventually FSOS Engines via the
// Integration Layer) inject these services.
@Module({
  imports: [FilesModule],
  providers: [
    GraphBuilderService,
    CanonicalHierarchyResolverService,
    { provide: ENTITY_PROVIDER, useClass: ExcelDatasetEntityProvider },
    NavigationEngineService,
    QueryExecutionEngineService,
    BusinessRulesEngineService,
    RieFacade,
  ],
  exports: [
    GraphBuilderService,
    // Exported so other modules that need row-level hierarchy scoping on
    // legacy (non-Canonical-Entity) datasets — currently just gpt.module.ts's
    // Custom GPT Action — can share the exact same RouteID resolution
    // ExcelDatasetEntityProvider uses, instead of a parallel implementation.
    CanonicalHierarchyResolverService,
    ENTITY_PROVIDER,
    NavigationEngineService,
    QueryExecutionEngineService,
    BusinessRulesEngineService,
    // RieFacade is the recommended surface for future consuming Engines —
    // the other exports remain available for callers that need
    // lower-level access, but new modules should prefer RieFacade.
    RieFacade,
  ],
})
export class RieModule {}
