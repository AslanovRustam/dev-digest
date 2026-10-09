import { describe, it, expect } from 'vitest';
import {
  buildLlmCallLog,
  formatCallLine,
  redactSecrets,
  stripUrlQuery,
  type LlmCallLogInput,
} from '../src/platform/llm-call-log.js';

const input: LlmCallLogInput = {
  call: 'intent',
  prId: 'pr-1',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  sections: [
    { name: 'pr-title', chars: 10, tokens: 3, truncated: false, original_chars: 10 },
    { name: 'file-list', chars: 100, tokens: 40, truncated: true, original_chars: 400 },
  ],
  sources: [{ kind: 'issue', ref: '#12', status: 'used', chars: 80, truncated: false }],
  latency_ms: 1200,
  tokens_in: 500,
  tokens_out: 50,
  cost_usd: 0.0004,
};

describe('buildLlmCallLog', () => {
  it('builds the record from an allowlist: unknown keys never survive', () => {
    const hostile = {
      ...input,
      messages: [{ role: 'user', content: 'DIFF BODY +secret' }],
      description: 'PR DESCRIPTION TEXT',
      sections: [{ ...input.sections[0]!, text: 'SECTION TEXT' }],
      sources: [{ ...input.sources![0]!, body: 'ISSUE BODY' }],
    } as unknown as LlmCallLogInput;
    const log = buildLlmCallLog(hostile);
    const json = JSON.stringify(log);
    expect(json).not.toContain('DIFF BODY');
    expect(json).not.toContain('PR DESCRIPTION');
    expect(json).not.toContain('SECTION TEXT');
    expect(json).not.toContain('ISSUE BODY');
    expect(Object.keys(log).sort()).toEqual(
      ['call', 'cost_usd', 'latency_ms', 'model', 'prId', 'provider', 'sections', 'sources', 'tokens_in', 'tokens_out', 'total_tokens_est'].sort(),
    );
  });

  it('sums the section tokens and keeps sizes only', () => {
    const log = buildLlmCallLog(input);
    expect(log.total_tokens_est).toBe(43);
    expect(log.sections[1]).toEqual({ name: 'file-list', chars: 100, tokens: 40, truncated: true, original_chars: 400 });
  });

  it('redacts secrets and strips URL queries in every string value', () => {
    const log = buildLlmCallLog({
      ...input,
      model: 'm-ghp_abcdefghijklmnopqrstuvwxyz0123',
      sources: [
        { kind: 'ticket', ref: 'https://acme.atlassian.net/browse/P-1?token=abc#frag', status: 'unsupported', chars: null, truncated: false },
      ],
      outcome: 'Bearer abc.def.ghi failed',
    });
    expect(log.model).toBe('m-[REDACTED]');
    expect(log.sources![0]!.ref).toBe('https://acme.atlassian.net/browse/P-1');
    expect(log.outcome).toBe('[REDACTED] failed');
  });

  it('omits optional fields that were not provided (pre-call record)', () => {
    const log = buildLlmCallLog({ ...input, latency_ms: undefined, tokens_in: undefined, tokens_out: undefined, cost_usd: undefined });
    expect('latency_ms' in log).toBe(false);
    expect('cost_usd' in log).toBe(false);
  });
});

describe('redactSecrets', () => {
  const secrets = [
    'ghp_abcdefghijklmnopqrstuvwxyz0123',
    'gho_abcdefghijklmnopqrstuvwxyz0123',
    'ghu_abcdefghijklmnopqrstuvwxyz0123',
    'ghs_abcdefghijklmnopqrstuvwxyz0123',
    'ghr_abcdefghijklmnopqrstuvwxyz0123',
    'github_pat_abcdefghijklmnopqrstuvwxyz0123', // pr-self-review-ignore: INV-SECRET — fake token shape that redactSecrets must catch, not a credential
    'sk-or-v1-0123456789abcdef0123456789abcdef', // pr-self-review-ignore: INV-SECRET — fake token shape that redactSecrets must catch, not a credential
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz', // pr-self-review-ignore: INV-SECRET — fake token shape that redactSecrets must catch, not a credential
    'sk-abcdefghijklmnopqrstuvwxyz0123', // pr-self-review-ignore: INV-SECRET — fake token shape that redactSecrets must catch, not a credential
    'Bearer eyJhbGciOi.abc.def',
    'AKIAABCDEFGHIJKLMNOP', // pr-self-review-ignore: INV-SECRET — fake token shape that redactSecrets must catch, not a credential
    'xoxb-123-456-abcdef',
  ];
  it.each(secrets)('redacts %s', (secret) => {
    const out = redactSecrets(`before ${secret} after`);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain(secret.slice(4));
  });
  it('leaves ordinary text alone', () => {
    expect(redactSecrets('model=deepseek/deepseek-v4-flash chars=120')).toBe('model=deepseek/deepseek-v4-flash chars=120');
  });
});

describe('stripUrlQuery / formatCallLine', () => {
  it('drops query and fragment from URLs only', () => {
    expect(stripUrlQuery('see https://a.com/x?y=1#z and b?c')).toBe('see https://a.com/x and b?c');
  });
  it('renders a compact line starting with the call kind and containing no prompt text', () => {
    const line = formatCallLine(buildLlmCallLog(input));
    expect(line.startsWith('call=intent model=deepseek/deepseek-v4-flash')).toBe(true);
    expect(line).toContain('pr-title:10c/3t');
    expect(line).toContain('file-list:100c/40t(truncated)');
    expect(line).toContain('issue:#12=used');
    expect(line).toContain('latency=1200ms');
  });
});
