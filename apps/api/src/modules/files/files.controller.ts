import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { confirmDatasetTypeSchema, type ConfirmDatasetTypeInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { FilesService } from "./files.service";

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // No dataset-type field — the platform classifies the workbook itself.
  // For multiple files, the client calls this once per file so each is
  // classified independently and the UI can resolve them one at a time.
  @Post()
  @Auth()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: Express.Multer.File) {
    if (!user.companyId) throw new ForbiddenException();
    if (!file) throw new ForbiddenException("No file provided");
    return this.filesService.uploadFile({
      companyId: user.companyId,
      uploadedByUserId: user.userId,
      file,
    });
  }

  @Get()
  @Auth()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!user.companyId) throw new ForbiddenException();
    return this.filesService.listActiveForCompany(user.companyId);
  }

  // Accept/override the platform's classification, or pick a sheet in a
  // mixed workbook. Any company member may confirm what they (or a
  // teammate) uploaded.
  @Patch(":id/confirm-type")
  @Auth()
  confirmType(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(confirmDatasetTypeSchema)) body: ConfirmDatasetTypeInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.filesService.confirmDatasetType(id, user.companyId, user.userId, body.datasetType, body.sheetIndex);
  }

  @Get(":id/download-url")
  @Auth("COMPANY_ADMIN")
  async downloadUrl(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    const url = await this.filesService.getDownloadUrl(id, user.companyId);
    return { url };
  }

  @Delete(":id")
  @Auth("COMPANY_ADMIN")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    if (!user.companyId) throw new ForbiddenException();
    return this.filesService.deactivate(id, user.companyId);
  }
}
