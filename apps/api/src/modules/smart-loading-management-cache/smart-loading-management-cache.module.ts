import { Module } from "@nestjs/common";
import { SmartLoadingManagementCacheService } from "./smart-loading-management-cache.service";

@Module({ providers: [SmartLoadingManagementCacheService], exports: [SmartLoadingManagementCacheService] })
export class SmartLoadingManagementCacheModule {}
