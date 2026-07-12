import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AuthModule } from "../auth/auth.module";
import { GptModule } from "../gpt/gpt.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { ScheduledTasksService } from "./scheduled-tasks.service";

@Module({
  imports: [SubscriptionsModule, AuthModule, GptModule, AuditLogModule],
  providers: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
