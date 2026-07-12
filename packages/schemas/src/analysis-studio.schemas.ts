import { z } from "zod";

// One block the GPT wants Analysis Studio to render. The platform decides
// HOW a given `type` renders (see apps/web's component registry) — the GPT
// only decides WHAT to show and supplies the data for it. `type` is
// deliberately a free string, not a closed enum: a new visualization is a
// new registry entry on the frontend, never a schema/migration change here.
export const analysisBlockSchema = z.object({
  type: z.string().min(1).max(60),
  id: z.string().min(1).max(100),
  title: z.string().max(200).optional(),
  // One line stating why this block exists — enforced so nothing decorative
  // ships in Analysis Studio (every visualization must justify itself).
  purpose: z.string().max(300).optional(),
  sourceDatasetIds: z.array(z.string()).optional(),
  payload: z.unknown(),
});
export type AnalysisBlock = z.infer<typeof analysisBlockSchema>;

// POST /gpt/render — called by the Custom GPT (same Bearer API key +
// sessionToken auth as verify-access/dataset) whenever it wants to present
// something in the user's Analysis Studio screen, in addition to answering
// in the chat itself. blocks: [] is valid and expected for the majority of
// questions — text-only stays text-only, nothing renders.
export const renderAnalysisEventSchema = z.object({
  narrative: z.string().max(4000).optional(),
  blocks: z.array(analysisBlockSchema).max(10).default([]),
});
export type RenderAnalysisEventInput = z.infer<typeof renderAnalysisEventSchema>;
