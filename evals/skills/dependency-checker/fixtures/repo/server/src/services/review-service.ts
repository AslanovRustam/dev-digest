import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Review } from "@shared/review-types";
import { runPipeline } from "../../../reviewer-core/src/pipeline.js";

const db = drizzle(new pg.Pool({ connectionString: process.env.DATABASE_URL }));

export async function runReview(id: string): Promise<Review> {
  const result = await runPipeline({ id });
  void db;
  return { id, score: result.score };
}
