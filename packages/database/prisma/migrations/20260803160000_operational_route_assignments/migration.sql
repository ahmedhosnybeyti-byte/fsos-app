CREATE TYPE "UserRouteAssignmentEndReason" AS ENUM ('TRANSFER', 'PROMOTION', 'UNASSIGNED', 'ROLE_CHANGED');

CREATE TABLE "user_route_assignments" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "route_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "assigned_by_user_id" TEXT NOT NULL,
  "end_reason" "UserRouteAssignmentEndReason",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_route_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_route_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_route_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_route_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "user_route_assignments_company_id_route_id_idx" ON "user_route_assignments"("company_id", "route_id");
CREATE INDEX "user_route_assignments_user_id_ended_at_idx" ON "user_route_assignments"("user_id", "ended_at");
CREATE UNIQUE INDEX "user_route_assignments_one_active_per_user" ON "user_route_assignments"("user_id") WHERE "ended_at" IS NULL;