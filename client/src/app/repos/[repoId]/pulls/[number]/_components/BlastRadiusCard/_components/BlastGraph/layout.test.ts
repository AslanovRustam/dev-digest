import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { buildGraphLayout, truncateLabel, COL_X, MAX_SYMBOLS, MAX_CALLERS, MAX_ENDPOINTS } from "./layout";

type Group = BlastRadiusResponse["downstream"][number];

const group = (symbol: string, callers: string[], endpoints: string[] = []): Group => ({
  symbol,
  callers: callers.map((name, i) => ({ name, file: `src/${name}.ts`, line: i + 1 })),
  endpoints_affected: endpoints,
  crons_affected: [],
});

describe("truncateLabel", () => {
  it("keeps short labels and shortens labels over 16 chars to 15 + ellipsis", () => {
    expect(truncateLabel("short")).toBe("short");
    expect(truncateLabel("a".repeat(16))).toBe("a".repeat(16));
    expect(truncateLabel("a".repeat(20))).toBe(`${"a".repeat(15)}…`);
  });
});

describe("buildGraphLayout", () => {
  it("places symbols, callers and endpoints in their columns", () => {
    const l = buildGraphLayout([group("run", ["h1", "h2"], ["GET /x"])]);
    const col = (c: keyof typeof COL_X) => l.nodes.filter((n) => n.column === c);
    expect(col("symbol")).toHaveLength(1);
    expect(col("caller")).toHaveLength(2);
    expect(col("endpoint")).toHaveLength(1);
    for (const n of l.nodes) expect(n.x).toBe(COL_X[n.column]);
    expect(l.height).toBeGreaterThan(0);
  });

  it("draws solid symbol->caller edges and dashed symbol->endpoint edges", () => {
    const l = buildGraphLayout([group("run", ["h1"], ["GET /x"])]);
    expect(l.edges).toHaveLength(2);
    expect(l.edges.filter((e) => e.dashed)).toHaveLength(1);
    expect(l.edges.find((e) => e.id === "s:run>e:GET /x")?.dashed).toBe(true);
    expect(l.edges.find((e) => e.id === "s:run>c:src/h1.ts|h1")?.dashed).toBe(false);
  });

  it("dedupes a caller shared by two symbols but keeps both edges", () => {
    const l = buildGraphLayout([group("a", ["shared"]), group("b", ["shared"])]);
    expect(l.nodes.filter((n) => n.column === "caller")).toHaveLength(1);
    expect(l.edges).toHaveLength(2);
  });

  it("caps symbols at 6 and adds a +N node", () => {
    const groups = Array.from({ length: 9 }, (_, i) => group(`sym${i}`, []));
    const symbols = buildGraphLayout(groups).nodes.filter((n) => n.column === "symbol");
    expect(symbols).toHaveLength(MAX_SYMBOLS + 1);
    expect(symbols.at(-1)).toMatchObject({ label: "+3", more: true });
  });

  it("caps callers at 12 and endpoints at 8 with +N nodes", () => {
    const callers = Array.from({ length: 15 }, (_, i) => `c${i}`);
    const endpoints = Array.from({ length: 10 }, (_, i) => `GET /e${i}`);
    const l = buildGraphLayout([group("run", callers, endpoints)]);
    const cs = l.nodes.filter((n) => n.column === "caller");
    const es = l.nodes.filter((n) => n.column === "endpoint");
    expect(cs).toHaveLength(MAX_CALLERS + 1);
    expect(cs.at(-1)?.label).toBe("+3");
    expect(es).toHaveLength(MAX_ENDPOINTS + 1);
    expect(es.at(-1)?.label).toBe("+2");
    expect(l.edges).toHaveLength(MAX_CALLERS + MAX_ENDPOINTS);
  });

  it("truncates long labels but keeps the full text as title", () => {
    const l = buildGraphLayout([group("aVeryLongSymbolNameIndeed", [])]);
    expect(l.nodes[0]?.label).toBe("aVeryLongSymbol…");
    expect(l.nodes[0]?.title).toBe("aVeryLongSymbolNameIndeed");
  });

  it("returns a valid empty layout", () => {
    const l = buildGraphLayout([]);
    expect(l.nodes).toEqual([]);
    expect(l.edges).toEqual([]);
  });
});
