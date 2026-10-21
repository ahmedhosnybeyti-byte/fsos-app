import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { ErpImportService } from "./erp-import.service";
@Injectable()
export class ErpImportWorker {
  private busy=false;
  private readonly logger=new Logger(ErpImportWorker.name);
  constructor(private readonly imports:ErpImportService){}
  @Interval(5000) async tick(){if(this.busy)return;this.busy=true;try{await this.imports.processNext();}catch{this.logger.error('ERP import worker unavailable; durable job retained');}finally{this.busy=false;}}
}
