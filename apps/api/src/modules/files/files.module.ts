import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { FilesService } from "./files.service";
import { FilesController } from "./files.controller";
import { STORAGE_PROVIDER } from "./storage/storage-provider.interface";
import { S3StorageProvider } from "./storage/s3-storage.provider";
import { DatasetClassifierService } from "./classification/dataset-classifier.service";
import { ImportValidationModule } from "../import-validation/import-validation.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";

@Module({
  imports: [AuditLogModule, ImportValidationModule, SubscriptionsModule, PlatformSettingsModule],
  providers: [
    FilesService,
    DatasetClassifierService,
    S3StorageProvider,
    { provide: STORAGE_PROVIDER, useExisting: S3StorageProvider },
  ],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
