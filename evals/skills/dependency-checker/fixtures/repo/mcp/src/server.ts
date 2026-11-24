import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const API = process.env.API_URL ?? "http://localhost:3001";

const server = new McpServer({ name: "reviews", version: "0.1.0" });

server.tool("get_review", { id: z.string() }, async ({ id }) => {
  const res = await fetch(`${API}/reviews/${id}`);
  return { content: [{ type: "text", text: await res.text() }] };
});
