import { z } from "zod";

// Customer Location Capture — for companies whose Customers file has no (or
// incomplete) latitude/longitude. A rep standing at the customer captures a
// coordinate on the spot; COMPANY_ADMIN/MANAGER later export everything
// captured so far as a plain Excel list (CustomerCode, lat, lon, who, when)
// and merge it into their own Customers file however they like (e.g. an
// Excel VLOOKUP on CustomerCode) — this module does not attempt the merge
// itself, only capture + list/export. See PROJECT_LOG.md for the full
// discussion of why: no code in this app ever rewrites an uploaded file in
// place, matching the "Snapshots, not Live data" principle the FSOS Sales
// Database design settled on.
//
// Persisted via the existing generic AiReport table (reportType:
// "customer_location_capture") rather than a new Prisma model/migration —
// same reuse pattern as SGI's "sgi_situations"/"sgi_config" and Analysis
// Studio's "analysis_studio_render".

export const captureCustomerLocationSchema = z.object({
  customerCode: z.string().trim().min(1).max(200),
  customerName: z.string().trim().max(200).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type CaptureCustomerLocationInput = z.infer<typeof captureCustomerLocationSchema>;

export const customerLocationRecordSchema = z.object({
  id: z.string(),
  customerCode: z.string(),
  customerName: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  capturedByUserId: z.string(),
  capturedByName: z.string(),
  capturedAt: z.string(),
});
export type CustomerLocationRecord = z.infer<typeof customerLocationRecordSchema>;
