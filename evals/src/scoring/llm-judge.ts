/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

function parseVerdict(text: string): Verdict["results"] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/**
 * Map the judge's results back onto the CASE's practice list — by text first, then by position — and
 * count a practice the judge skipped as FAIL. The judge echoes each practice and sometimes rewords it
 * (a dropped ")" or "the finding" → "it"); stats keyed by the echo then split one practice into two
 * rows, and a dropped/added item changed the score's denominator. After this the text is always the
 * case's own and the denominator is always the case's practice count.
 */
export function alignResults(practices: string[], results: Verdict["results"]): Verdict["results"] {
  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const byText = new Map(results.map((r) => [norm(r.practice), r]));
  return practices.map((practice, i) => {
    const r = byText.get(norm(practice)) ?? results[i];
    return r
      ? { practice, passed: r.passed === true, evidence: String(r.evidence ?? "") }
      : { practice, passed: false, evidence: "(not judged — missing from the judge's reply)" };
  });
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  const results = alignResults(practices, parseVerdict(res.text));
  const total = practices.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total };
}
