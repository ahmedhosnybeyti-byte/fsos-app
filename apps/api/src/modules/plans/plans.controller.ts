import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createPlanSchema, type CreatePlanInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PlansService } from "./plans.service";

@ApiTags("plans")
@Controller("plans")
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  // Public — powers the landing page pricing table and the registration form.
  @Get()
  @Public()
  list() {
    return this.plansService.listActive();
  }

  @Get("all")
  @Auth("SUPER_ADMIN")
  listAll() {
    return this.plansService.listAll();
  }

  @Post()
  @Auth("SUPER_ADMIN")
  create(@Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanInput) {
    return this.plansService.create(body);
  }

  @Patch(":id")
  @Auth("SUPER_ADMIN")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(createPlanSchema.partial())) body: Partial<CreatePlanInput>) {
    return this.plansService.update(id, body);
  }
}
