/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process — repo-intel (repo-map budget), reviews (per-skill token
 * attribution in the run trace) and project-context (document tokens, the
 * per-document truncation). Swappable in tests via a
 * mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
  /** The longest prefix of `text` that counts ≤ `max` tokens (the whole text when it fits). */
  truncate(text: string, max: number): string;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Heuristic truncate matching `approxTokens`: `max` tokens ≈ `max × 4` chars. */
export function approxTruncate(text: string, max: number): string {
  return text.length <= max * 4 ? text : text.slice(0, max * 4);
}

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      return this.enc.encode(text).length;
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }

  truncate(text: string, max: number): string {
    if (this.broken) return approxTruncate(text, max);
    try {
      this.enc ??= getEncoding('cl100k_base');
      const ids = this.enc.encode(text);
      if (ids.length <= max) return text;
      // A decoded prefix can re-encode to MORE tokens (BPE merges differ at the
      // cut, a split multi-byte char decodes to U+FFFD) — shrink until it fits.
      let n = max;
      let out = this.enc.decode(ids.slice(0, n)).replace(/�+$/, '');
      while (n > 0 && this.enc.encode(out).length > max) {
        n -= 1;
        out = this.enc.decode(ids.slice(0, n)).replace(/�+$/, '');
      }
      return out;
    } catch {
      this.broken = true;
      return approxTruncate(text, max);
    }
  }
}
