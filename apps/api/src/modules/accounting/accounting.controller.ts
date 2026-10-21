import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AccountingService } from "./accounting.service";

@Controller("sfa/accounting")
@Auth("COMPANY_ADMIN","MANAGER")
@RequiresSfa("accounting.read")
@CompanyScreen("accounting-core")
export class AccountingController {
  constructor(private readonly service:AccountingService) {}
  @Get("book") book(@CurrentUser() u:AuthenticatedUser) {return this.service.book(u);}
  @Get("accounts") accounts(@CurrentUser() u:AuthenticatedUser,@Query() q:unknown) {return this.service.accounts(u,q);}
  @Post("accounts") @RequiresSfa("accounting.accounts.manage")
  createAccount(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown) {return this.service.createAccount(u,b);}
  @Get("journals") journals(@CurrentUser() u:AuthenticatedUser,@Query() q:unknown) {return this.service.journals(u,q);}
  @Get("journals/:id") journal(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string) {return this.service.journal(u,id);}
  @Post("journals") @RequiresSfa("accounting.journal.post")
  post(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown) {return this.service.post(u,b);}
  @Post("journals/:id/reverse") @RequiresSfa("accounting.journal.reverse")
  reverse(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string,@Body() b:unknown) {return this.service.reverse(u,id,b);}
  @Post("journals/:id/correct") @RequiresSfa("accounting.journal.reverse","accounting.journal.post")
  correct(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string,@Body() b:unknown) {return this.service.correct(u,id,b);}
  @Get("trial-balance") trial(@CurrentUser() u:AuthenticatedUser,@Query() q:unknown) {return this.service.trial(u,q);}
  @Post("close-period") @RequiresSfa("accounting.period.close")
  close(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown) {return this.service.closePeriod(u,b);}
}
