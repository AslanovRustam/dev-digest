import type { ReportInput } from './types.js';

/** Render a report as markdown for GitHub and for export. */
export function renderMarkdown(input: ReportInput): string {
  const lines = [
    `# Review of ${input.repo}#${input.prNumber}`,
    '',
    `**${input.title}**`,
    '',
    `Score: ${input.score} · Blocking findings: ${input.blockers}`,
    '',
  ];
  if (input.note) lines.push(`> ${input.note}`, '');
  if (input.findings.length === 0) {
    lines.push('No findings.');
  }
  for (const f of input.findings) {
    lines.push(`- **${f.severity}** \`${f.file}:${f.start_line}\` ${f.title}`);
  }
  return lines.join('\n');
}

/** Render a report as a stable JSON document for export. */
export function renderJson(input: ReportInput): string {
  return JSON.stringify(
    {
      repo: input.repo,
      pr: input.prNumber,
      title: input.title,
      score: input.score,
      blockers: input.blockers,
      findings: input.findings.map((f) => ({
        severity: f.severity,
        file: f.file,
        line: f.start_line,
        title: f.title,
      })),
    },
    null,
    2,
  );
}
