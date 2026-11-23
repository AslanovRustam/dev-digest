import { z } from "zod";
import type { Review } from "@shared/review-types";

const Input = z.object({ id: z.string() });

export async function runPipeline(input: unknown): Promise<Pick<Review, "score">> {
  Input.parse(input);
  return { score: 1 };
}
