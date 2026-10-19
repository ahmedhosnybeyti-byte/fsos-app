import { SetMetadata } from "@nestjs/common";
import { SFA_ACCESS_PERMISSION } from "@field-sales-os/schemas";

export const SFA_PERMISSIONS_KEY = "sfa_permissions";

/** Future SFA controllers/actions require both this gate and their normal Auth/scope checks. */
export const RequiresSfa = (...operationPermissions: string[]) =>
  SetMetadata(SFA_PERMISSIONS_KEY, [SFA_ACCESS_PERMISSION, ...operationPermissions]);
