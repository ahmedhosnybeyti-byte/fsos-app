import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createDataSourceTypeSchema, type CreateDataSourceTypeInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { DataSourceTypesService } from "./data-source-types.service";

// Platform-level metadata. Listing is open to any authenticated user
// (needed to populate the "create data source" form); defining new types
// is a platform governance action, SUPER_ADMIN-only.
@ApiTags("data-source-types")
@Controller("data-source-types")
export class DataSourceTypesController {
  constructor(private readonly dataSourceTypesService: DataSourceTypesService) {}

  @Get()
  @Auth()
  list() {
    return this.dataSourceTypesService.list();
  }

  @Post()
  @Auth("SUPER_ADMIN")
  create(@Body(new ZodValidationPipe(createDataSourceTypeSchema)) body: CreateDataSourceTypeInput) {
    return this.dataSourceTypesService.create(body);
  }
}
