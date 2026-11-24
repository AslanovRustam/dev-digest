import { z } from "zod";

export const ReviewSchema = z.object({
  id: z.string(),
  score: z.number(),
  summary: z.string(),
});
