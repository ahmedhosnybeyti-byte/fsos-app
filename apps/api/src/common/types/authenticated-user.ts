import type { RoleCode } from "@field-sales-os/schemas";

// Shape of `req.user`, attached by JwtStrategy after validating the access
// token. companyId is null only for platform SUPER_ADMIN users.
export interface AuthenticatedUser {
  userId: string;
  companyId: string | null;
  email: string;
  roleCode: RoleCode;
  permissions: string[];
}
