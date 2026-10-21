import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Auth } from "../../common/decorators/auth.decorator";
import { SkipSubscriptionCheck } from "../../common/decorators/skip-subscription-check.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { erpImportPageSchema } from "@field-sales-os/schemas";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ErpImportService } from "./erp-import.service";
import { RieErpHistoryQueryService } from "../rie/erp-history-query.service";
@Controller('admin/erp-import/:company')
@Auth('SUPER_ADMIN')
@SkipSubscriptionCheck()
export class ErpImportController {
  constructor(private readonly imports:ErpImportService,private readonly history:RieErpHistoryQueryService){}
  @Post('start') start(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string,@Body()b:unknown){return this.imports.start(u,c,b);}
  @Get() status(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string){return this.imports.status(u,c);}
  @Post('upload') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:64*1024**2,files:1}})) upload(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string,@UploadedFile()f:Express.Multer.File){return this.imports.upload(u,c,f);}
  @Get('errors') errors(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string,@Query(new ZodValidationPipe(erpImportPageSchema))q:{page:number}){return this.imports.errors(u,c,q.page);}
  @Post('uploads/:upload/review-errors') review(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string,@Param('upload')id:string,@Body()b:{note:string}){return this.imports.reviewErrors(u,c,id,b.note);}
  @Post('approve') approve(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string,@Body()b:unknown){return this.imports.approve(u,c,b);}
  @Get('history') preview(@CurrentUser()u:AuthenticatedUser,@Param('company')c:string,@Query('entity')entity:string,@Query('asOf')asOf:string,@Query('page')page='1'){this.imports.authorize(u);return this.history.query(c,entity,asOf,Number(page));}
}
