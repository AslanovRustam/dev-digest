import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Review } from "@shared/review-types";
import { runReview } from "../services/review-service.js";

const Params = z.object({ id: z.string() });

export function registerReviewRoutes(app: FastifyInstance): void {
  app.post("/reviews/:id/run", async (req) => {
    const { id } = Params.parse(req.params);
    const review: Review = await runReview(id);
    return review;
  });
}
