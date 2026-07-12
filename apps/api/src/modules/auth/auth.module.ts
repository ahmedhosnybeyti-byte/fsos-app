import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { CompaniesModule } from "../companies/companies.module";
import { UsersModule } from "../users/users.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { RolesModule } from "../roles/roles.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { TokensService } from "./tokens.service";
import { JwtAccessStrategy } from "./strategies/jwt-access.strategy";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({}),
    CompaniesModule,
    UsersModule,
    SubscriptionsModule,
    AuditLogModule,
    RolesModule,
  ],
  providers: [AuthService, TokensService, JwtAccessStrategy],
  controllers: [AuthController],
  exports: [TokensService],
})
export class AuthModule {}
