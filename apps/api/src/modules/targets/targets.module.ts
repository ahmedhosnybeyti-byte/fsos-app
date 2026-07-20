import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { RieModule } from "../rie/rie.module";
import { TargetsService } from "./targets.service";
import { TargetsController } from "./targets.controller";

@Module({
  imports: [FilesModule, RieModule],
  providers: [TargetsService],
  controllers: [TargetsController],
  exports: [TargetsService],
})
export class TargetsModule {}
