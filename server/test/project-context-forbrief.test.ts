import { describe, it, expect } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { Container } from '../src/platform/container.js';
import type { RepoRow } from '../src/db/rows.js';

const repoRow = { id: 'r1', owner: 'acme', name: 'app', fullName: 'acme/app' } as unknown as RepoRow;

/** A service whose repository and git reads are stubs; `forBrief` is what is under test. */
function serviceWith(opts: {
  enabledAgents: () => Promise<{ id: string; name: string }[]>;
  agentPaths?: Record<string, string[]>;
  readable?: Set<string>;
}): ProjectContextService {
  const container = {
    db: {},
    config: { projectContextRoots: [] },
    tokenizer: { count: (t: string) => t.length },
    git: {
      readWorkingFile: async (_ref: unknown, path: string) =>
        opts.readable?.has(path)
          ? { ok: true, text: `text of ${path}`, size: 10, mtimeMs: 1 }
          : { ok: false, code: 'unreadable' },
    },
  } as unknown as Container;
  const service = new ProjectContextService(container);
  (service as unknown as { repo: unknown }).repo = {
    enabledAgents: opts.enabledAgents,
    ownPathsOfEnabledAgents: async () =>
      Object.entries(opts.agentPaths ?? {}).flatMap(([agentId, paths]) => paths.map((path) => ({ agentId, path }))),
    skillPathsOfEnabledAgents: async () => [],
  };
  return service;
}

describe('ProjectContextService.forBrief', () => {
  it('a context failure → unreadable, not none_attached', async () => {
    const service = serviceWith({
      enabledAgents: async () => {
        throw new Error('db down');
      },
    });
    expect(await service.forBrief('w1', repoRow)).toEqual({ documents: [], missing: 'unreadable' });
  });

  it('no agent with attached paths → none_attached', async () => {
    const service = serviceWith({ enabledAgents: async () => [{ id: 'a1', name: 'A' }] });
    expect(await service.forBrief('w1', repoRow)).toEqual({ documents: [], missing: 'none_attached' });
  });

  it('one readable and one unreadable document → the documents plus the unreadable path', async () => {
    const service = serviceWith({
      enabledAgents: async () => [{ id: 'a1', name: 'A' }],
      agentPaths: { a1: ['docs/ok.md', 'docs/gone.md'] },
      readable: new Set(['docs/ok.md']),
    });
    const res = await service.forBrief('w1', repoRow);
    expect(res.missing).toBeNull();
    expect(res.documents.map((d) => d.path)).toEqual(['docs/ok.md']);
    expect(res.unreadable).toEqual(['docs/gone.md']);
  });

  it('nothing readable → unreadable', async () => {
    const service = serviceWith({
      enabledAgents: async () => [{ id: 'a1', name: 'A' }],
      agentPaths: { a1: ['docs/gone.md'] },
    });
    expect(await service.forBrief('w1', repoRow)).toEqual({ documents: [], missing: 'unreadable' });
  });
});
