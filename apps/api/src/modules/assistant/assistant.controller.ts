import { Body, Controller, ForbiddenException, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { assistantChatRequestSchema, type AssistantChatRequest } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AssistantService } from "./assistant.service";

// The native, in-app screen replacing the external "Launch Custom GPT"
// flow (see gpt.module.ts, kept intact/untouched for now — see
// PROJECT_LOG.md). One stateless endpoint: the frontend keeps the running
// message list and resends it each turn, so there's no session/launch-code
// handshake to manage here.
@ApiTags("assistant")
@Controller("assistant")
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("chat")
  @Auth()
  chat(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(assistantChatRequestSchema)) body: AssistantChatRequest) {
    if (!user.companyId) throw new ForbiddenException();
    return this.assistantService.chat(user, body);
  }
}
