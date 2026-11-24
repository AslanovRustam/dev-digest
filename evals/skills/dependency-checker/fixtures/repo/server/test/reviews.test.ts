import { describe, expect, it } from "vitest";
import { mockLlm } from "../src/adapters/mocks.js";

describe("mocks", () => {
  it("answers", async () => {
    expect((await mockLlm.complete("x")).text).toBe("{}");
  });
});
