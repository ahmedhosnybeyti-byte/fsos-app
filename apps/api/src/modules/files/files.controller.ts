import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import { searchFileRowsQuerySchema, type SearchFileRowsQueryInput } from "@field-sales-os/schemas";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { FilesService } from "./files.service";

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // Company scoping for uploads/lists (2026-07-19). A regular user's
  // company comes EXCLUSIVELY from their own account — any
  // targetCompanyId they might send is rejected outright, never silently
  // ignored, so cross-tenant injection attempts are loud. A SUPER_ADMIN
  // (whose account belongs to no company) must explicitly pick a target
  // company instead — the ONE narrowly-scoped on-behalf-of mechanism, no
  // general impersonation. The chosen id is validated against the real
  // companies table before anything is written.
  private async resolveCompanyId(user: AuthenticatedUser, targetCompanyId?: string): Promise<string> {
    if (user.roleCode === "SUPER_ADMIN") {
      if (!targetCompanyId) throw new BadRequestException("Pick a target company first — a Super Admin account belongs to no company of its own.");
      await this.filesService.assertCompanyExists(targetCompanyId);
      return targetCompanyId;
    }
    if (targetCompanyId && targetCompanyId !== user.companyId) {
      throw new ForbiddenException("You can only work with your own company's files.");
    }
    if (!user.companyId) throw new ForbiddenException();
    return user.companyId;
  }

  // No dataset-type field — the platform classifies the workbook itself.
  // For multiple files, the client calls this once per file so each is
  // classified independently and the UI can resolve them one at a time.
  //
  // One call can now return MULTIPLE entities (2026-07-19 — single-file
  // multi-sheet upload support): a workbook with several officially-named
  // sheets (e.g. the full 18-entity canonical master file) produces one
  // BatchUploadResult with up to 18 accepted File rows, sharing one
  // batchId. See FilesService.processWorkbook / uploadFile for the full
  // accept/reject/ignore semantics per sheet.
  @Post()
  @Auth()
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body("targetCompanyId") targetCompanyId?: string,
  ) {
    if (!file) throw new ForbiddenException("No file provided");
    const companyId = await this.resolveCompanyId(user, targetCompanyId);
    return this.filesService.uploadFile({
      companyId,
      uploadedByUserId: user.userId,
      file,
      viaSuperAdmin: user.roleCode === "SUPER_ADMIN",
    });
  }

  // "استبدال ملف" — admin-driven replace (not auto-detected) so a daily/
  // recurring re-export can carry over its SGI file selection instead of the
  // admin redoing that one-time setup on every upload. COMPANY_ADMIN-only:
  // replacing a company's canonical data source is an admin action. The old
  // file is soft-deactivated, never deleted.
  @Post(":id/replace")
  @Auth("COMPANY_ADMIN")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async replace(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!user.companyId) throw new ForbiddenException();
    if (!file) throw new ForbiddenException("No file provided");
    return this.filesService.replaceFile({
      companyId: user.companyId,
      uploadedByUserId: user.userId,
      file,
      oldFileId: id,
    });
  }

  // For a SUPER_ADMIN the Files screen passes ?companyId= (the same target
  // company chosen for uploading) so the list shows that company's files;
  // regular users always get exactly their own company's list regardless of
  // any query param (resolveCompanyId rejects a mismatching one).
  @Get()
  @Auth()
  async list(@CurrentUser() user: AuthenticatedUser, @Query("companyId") companyId?: string) {
    if (user.roleCode === "SUPER_ADMIN" && !companyId) return [];
    const resolved = await this.resolveCompanyId(user, companyId);
    return this.filesService.listActiveForCompany(resolved);
  }

  // Free-text row search inside one file — no column mapping required. Any
  // company member may search (mirrors upload's no-role-restriction
  // reasoning): this only reads a file this company already owns, and it's
  // used by any rep on the Customer Location Capture screen to confirm they
  // typed the right customer before saving a location.
  @Get(":id/search-rows")
  @Auth()
  searchRows(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(searchFileRowsQuerySchema)) query: SearchFileRowsQueryInput,
  ) {
    if (!user.companyId) throw new ForbiddenException();
    return this.filesService.searchRows(id, user.companyId, query.q, query.limit);
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
