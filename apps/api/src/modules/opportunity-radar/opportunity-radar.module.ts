import { Module } from "@nestjs/common";
import { OpportunityRadarController } from "./opportunity-radar.controller";
import { OpportunityRadarService } from "./opportunity-radar.service";

@Module({ controllers: [OpportunityRadarController], providers: [OpportunityRadarService] })
export class OpportunityRadarModule {}
