import Fastify from "fastify";
import { registerReviewRoutes } from "./routes/reviews.js";

const app = Fastify({ logger: true });
registerReviewRoutes(app);
await app.listen({ port: 3001 });
