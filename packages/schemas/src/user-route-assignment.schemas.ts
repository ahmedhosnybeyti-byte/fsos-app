import { z } from "zod";

export const routeAssignmentEndReasonSchema = z.enum(["TRANSFER", "PROMOTION", "UNASSIGNED", "ROLE_CHANGED"]);
export type RouteAssignmentEndReason = z.infer<typeof routeAssignmentEndReasonSchema>;

export const assignUserRouteSchema = z.object({ routeId: z.string().trim().min(1).max(200) });
export type AssignUserRouteInput = z.infer<typeof assignUserRouteSchema>;

export const unassignUserRouteSchema = z.object({ reason: routeAssignmentEndReasonSchema.default("UNASSIGNED") });
export type UnassignUserRouteInput = z.infer<typeof unassignUserRouteSchema>;