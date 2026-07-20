import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createSchemaDefinitionSchema, type CreateSchemaDefinitionInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SchemaRegistryService } from "./schema-registry.service";

// Platform-global, like DataSourceTypesController: listing is open to any
// authenticated user, defining new entity schemas is SUPER_ADMIN-only.
@ApiTags("schema-registry")
@Controller("schema-registry")
export class SchemaRegistryController {
  constructor(private readonly schemaRegistryService: SchemaRegistryService) {}

  @Get()
  @Auth()
  list() {
    return this.schemaRegistryService.list();
  }

  @Post()
  @Auth("SUPER_ADMIN")
  create(@Body(new ZodValidationPipe(createSchemaDefinitionSchema)) body: CreateSchemaDefinitionInput) {
    return this.schemaRegistryService.create(body);
  }
}
