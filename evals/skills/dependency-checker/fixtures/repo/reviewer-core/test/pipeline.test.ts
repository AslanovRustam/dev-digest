import { mockLlm } from "../../server/src/adapters/mocks.js";
import { runPipeline } from "../src/pipeline.js";

const r = await runPipeline({ id: "1" });
if (r.score !== 1 || !mockLlm) throw new Error("pipeline");
