import { Body,Controller,Get,Param,Post,Query } from "@nestjs/common";
import { Auth } from "../../common/decorators/auth.decorator";
import { CompanyScreen } from "../../common/decorators/company-screen.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresSfa } from "../../common/decorators/requires-sfa.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AccountingSubledgerService } from "./accounting-subledger.service";
@Controller("sfa/accounting") @Auth("COMPANY_ADMIN","MANAGER") @CompanyScreen("accounting-core") @RequiresSfa("accounting.read")
export class AccountingSubledgerController {
 constructor(private readonly service:AccountingSubledgerService){}
 @Get("parties") parties(@CurrentUser() u:AuthenticatedUser,@Query() q:unknown){return this.service.parties(u,q);}
 @Post("parties") @RequiresSfa("accounting.parties.manage")
 createParty(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown){return this.service.createParty(u,b);}
 @Get("parties/:id") party(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string){return this.service.partySummary(u,id);}
 @Get("parties/:id/statement") statement(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string,@Query() q:unknown){return this.service.statement(u,id,q);}
 @Get("treasury") @RequiresSfa("accounting.treasury.read")
 treasury(@CurrentUser() u:AuthenticatedUser,@Query() q:unknown){return this.service.treasury(u,q);}
 @Post("treasury") @RequiresSfa("accounting.treasury.read","accounting.treasury.manage")
 registerTreasury(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown){return this.service.registerTreasury(u,b);}
 @Post("receipts") @RequiresSfa("accounting.ar.read","accounting.receipts.post","accounting.treasury.read")
 receipt(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown){return this.service.receipt(u,b);}
 @Post("disbursements") @RequiresSfa("accounting.ap.read","accounting.payments.post","accounting.treasury.read")
 payment(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown){return this.service.payment(u,b);}
 @Post("party-openings") @RequiresSfa("accounting.opening.post")
 opening(@CurrentUser() u:AuthenticatedUser,@Body() b:unknown){return this.service.opening(u,b);}
 @Post("parties/:id/vouchers/:voucher/reverse") @RequiresSfa("accounting.journal.reverse")
 reverse(@CurrentUser() u:AuthenticatedUser,@Param("id") id:string,@Param("voucher") v:string,@Body() b:unknown){return this.service.reverse(u,id,v,b);}
}
