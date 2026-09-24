// Stop hook: after a prompt in which the agent used tools, ask it once to run the
// engineering-insights check. Fails open — any error means "let the agent stop".
import { readFileSync } from 'node:fs';

const SKILL = 'engineering-insights';
const REASON =
  `${SKILL} check: review this turn against the gate in .claude/skills/${SKILL}/SKILL.md. ` +
  `Append each qualifying insight to the owning module's INSIGHTS.md, or reply "Insights: nothing new". ` +
  `Keep it short.`;

function isRealPrompt(entry) {
  if (entry.type !== 'user' || entry.isMeta) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && !content.some((block) => block.type === 'tool_result');
}

function toolUsesSinceLastPrompt(transcriptPath) {
  const entries = readFileSync(transcriptPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isRealPrompt(entries[i])) {
      start = i + 1;
      break;
    }
  }

  return entries
    .slice(start)
    .filter((entry) => entry.type === 'assistant' && Array.isArray(entry.message?.content))
    .flatMap((entry) => entry.message.content.filter((block) => block.type === 'tool_use'));
}

function alreadyChecked(toolUses) {
  return toolUses.some(
    (use) =>
      (use.name === 'Skill' && use.input?.skill === SKILL) ||
      /INSIGHTS\.md$/.test(String(use.input?.file_path ?? '')),
  );
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.stop_hook_active || !input.transcript_path) process.exit(0);

  const toolUses = toolUsesSinceLastPrompt(input.transcript_path);
  if (toolUses.length === 0 || alreadyChecked(toolUses)) process.exit(0);

  process.stdout.write(JSON.stringify({ decision: 'block', reason: REASON }));
} catch {
  process.exit(0);
}
