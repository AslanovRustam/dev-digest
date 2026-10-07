/** Rough token estimate for the editor header (≈ 4 chars per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Number of lines the gutter must number (an empty body is one line). */
export function countLines(text: string): number {
  return text.split("\n").length;
}

/** "1\n2\n…\nN" — the gutter's text, one number per body line. */
export function gutterText(lines: number): string {
  return Array.from({ length: lines }, (_, i) => String(i + 1)).join("\n");
}
