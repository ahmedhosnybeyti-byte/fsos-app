import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { RoutePlanningService } from "./route-planning.service";
import { RoutePlanningController } from "./route-planning.controller";

@Module({
  imports: [FilesModule],
  providers: [RoutePlanningService],
  controllers: [RoutePlanningController],
  exports: [RoutePlanningService],
})
export class RoutePlanningModule {}
