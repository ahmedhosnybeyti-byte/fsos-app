import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { LostOpportunityService } from "./lost-opportunity.service";

@Module({ imports: [RieModule], providers: [LostOpportunityService], exports: [LostOpportunityService] })
export class LostOpportunityModule {}