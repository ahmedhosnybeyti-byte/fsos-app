import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { SfaSetupController } from "./sfa-setup.controller";
import { SfaSetupService } from "./sfa-setup.service";

@Module({ imports: [AuditLogModule], controllers: [SfaSetupController], providers: [SfaSetupService] })
export class SfaSetupModule {}
