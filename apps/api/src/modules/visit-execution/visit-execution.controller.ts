import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { VisitExecutionService } from "./visit-execution.service";

@Controller("sfa/visits")
@Auth("SALES_REP")
@RequiresSfa("visits.execute")
export class VisitExecutionController {
  constructor(private readonly service: VisitExecutionService) {}
  @Get("access") access() { return { allowed: true }; }
  @Post() start(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.service.start(user, body); }
  @Get(":id") read(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.read(user, id); }
  @Get(":id/context") context(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) { return this.service.context(user, id); }
  @Patch(":id") save(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown) { return this.service.save(user, id, body); }
  @Post(":id/photos")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2, fieldSize: 200 } }))
  upload(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() body: unknown, @UploadedFile() file: Express.Multer.File) { return this.service.upload(user, id, body, file); }
  @Get(":id/photos/:photoId/url") photoUrl(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("photoId") photoId: string) { return this.service.photoUrl(user, id, photoId); }
}
