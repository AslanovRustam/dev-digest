/* Pure layout for the blast-radius graph: three columns (changed symbols → callers → endpoints),
   capped per column, overflow collapsed into a "+N" node. No React. */
import type { BlastRadiusResponse } from "@devdigest/shared";

type Group = BlastRadiusResponse["downstream"][number];

export const MAX_SYMBOLS = 6;
export const MAX_CALLERS = 12;
export const MAX_ENDPOINTS = 8;
export const MAX_LABEL = 16;
export const ROW_GAP = 34;
export const PAD_Y = 20;
export const NODE_H = 26;
export const COL_X = { symbol: 80, caller: 320, endpoint: 560 } as const;
export const NODE_W = { symbol: 120, caller: 140, endpoint: 170 } as const;
export const GRAPH_WIDTH = 660;

export type GraphColumn = keyof typeof COL_X;

export interface GraphNode {
  id: string;
  column: GraphColumn;
  x: number;
  y: number;
  w: number;
  /** Shortened text drawn in the node. */
  label: string;
  /** Full text for the tooltip. */
  title: string;
  /** True for the "+N" overflow node. */
  more: boolean;
}

export interface GraphEdge {
  id: string;
  d: string;
  dashed: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export function truncateLabel(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
}

interface Item {
  id: string;
  label: string;
  title: string;
}

/** Cap a column's items; the remainder becomes one "+N" item. */
function capColumn(items: Item[], max: number, column: GraphColumn): { shown: Item[]; nodes: Omit<GraphNode, "x" | "y">[] } {
  const shown = items.slice(0, max);
  const nodes: Omit<GraphNode, "x" | "y">[] = shown.map((i) => ({
    id: i.id,
    column,
    w: NODE_W[column],
    label: truncateLabel(i.label),
    title: i.title,
    more: false,
  }));
  const rest = items.length - shown.length;
  if (rest > 0) {
    nodes.push({ id: `more:${column}`, column, w: NODE_W[column], label: `+${rest}`, title: `+${rest}`, more: true });
  }
  return { shown, nodes };
}

function curve(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + from.w / 2;
  const x2 = to.x - to.w / 2;
  const mid = (x1 + x2) / 2;
  return `M${x1},${from.y} C${mid},${from.y} ${mid},${to.y} ${x2},${to.y}`;
}

export function buildGraphLayout(downstream: readonly Group[]): GraphLayout {
  const symbolItems: Item[] = [];
  const seenSymbols = new Set<string>();
  for (const g of downstream) {
    if (seenSymbols.has(g.symbol)) continue;
    seenSymbols.add(g.symbol);
    symbolItems.push({ id: `s:${g.symbol}`, label: g.symbol, title: g.symbol });
  }
  const symbols = capColumn(symbolItems, MAX_SYMBOLS, "symbol");
  const shownSymbols = new Set(symbols.shown.map((i) => i.id));

  // Callers and endpoints come from the symbols actually drawn, so every node has an edge.
  const callerItems: Item[] = [];
  const seenCallers = new Set<string>();
  const endpointItems: Item[] = [];
  const seenEndpoints = new Set<string>();
  const live = downstream.filter((g) => shownSymbols.has(`s:${g.symbol}`));
  for (const g of live) {
    for (const c of g.callers) {
      const id = `c:${c.file}|${c.name}`;
      if (seenCallers.has(id)) continue;
      seenCallers.add(id);
      callerItems.push({ id, label: c.name, title: `${c.name} — ${c.file}` });
    }
    for (const e of g.endpoints_affected) {
      const id = `e:${e}`;
      if (seenEndpoints.has(id)) continue;
      seenEndpoints.add(id);
      endpointItems.push({ id, label: e, title: e });
    }
  }
  const callers = capColumn(callerItems, MAX_CALLERS, "caller");
  const endpoints = capColumn(endpointItems, MAX_ENDPOINTS, "endpoint");

  const rows = Math.max(symbols.nodes.length, callers.nodes.length, endpoints.nodes.length, 1);
  const height = PAD_Y * 2 + (rows - 1) * ROW_GAP + NODE_H;

  // Each column is centred vertically against the tallest one.
  const place = (col: Omit<GraphNode, "x" | "y">[]): GraphNode[] => {
    const offset = ((rows - col.length) * ROW_GAP) / 2;
    return col.map((n, i) => ({
      ...n,
      x: COL_X[n.column],
      y: PAD_Y + NODE_H / 2 + offset + i * ROW_GAP,
    }));
  };
  const nodes = [...place(symbols.nodes), ...place(callers.nodes), ...place(endpoints.nodes)];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  const addEdge = (fromId: string, toId: string, dashed: boolean) => {
    const id = `${fromId}>${toId}`;
    const a = byId.get(fromId);
    const b = byId.get(toId);
    if (!a || !b || seenEdges.has(id)) return;
    seenEdges.add(id);
    edges.push({ id, d: curve(a, b), dashed });
  };
  for (const g of live) {
    const from = `s:${g.symbol}`;
    for (const c of g.callers) addEdge(from, `c:${c.file}|${c.name}`, false);
    // Endpoints are attributed per symbol by the contract, not per caller.
    for (const e of g.endpoints_affected) addEdge(from, `e:${e}`, true);
  }

  return { nodes, edges, width: GRAPH_WIDTH, height };
}
