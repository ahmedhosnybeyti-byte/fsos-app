import { Module } from "@nestjs/common";
import { RieModule } from "../rie/rie.module";
import { DashboardPerformanceController } from "./dashboard-performance.controller";
import { DashboardPerformanceService } from "./dashboard-performance.service";

@Module({ imports: [RieModule], providers: [DashboardPerformanceService], controllers: [DashboardPerformanceController] })
export class DashboardPerformanceModule {}
