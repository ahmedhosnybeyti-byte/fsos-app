import { Injectable } from "@nestjs/common";
import { validateEnv } from "./env.validation";
import { buildConfiguration, type AppConfig } from "./configuration";

@Injectable()
export class AppConfigService {
  readonly values: AppConfig;

  constructor() {
    const env = validateEnv(process.env);
    this.values = buildConfiguration(env);
  }
}
