import { SetMetadata } from "@nestjs/common";
import type { CompanyScreenFeatureKey } from "@field-sales-os/schemas";

export const COMPANY_SCREEN_KEY = "company_screen_key";

/** Requires the current company to have this screen enabled. */
export const CompanyScreen = (key: CompanyScreenFeatureKey) => SetMetadata(COMPANY_SCREEN_KEY, key);
