/**
 * Project Context (L05) — routes against real Postgres with mock git / GitHub:
 * the document list and read (AC-1..4, AC-8, NFR-1), attachments (AC-10, AC-12,
 * AC-13, AC-38, AC-39), saves as a new branch + PR (AC-29..33), rate limits
 * (NFR-5) and the GitHub token never leaving the server (NFR-6).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
  type MockGitOptions,
} from '../src/adapters/mocks.js';
import { contentVersion } from '../src/platform/content-version.js';
import * as t from '../src/db/schema.js';
import { ContextAttachments, ContextDocList, ContextDocument, ContextSaveResult } from '@devdigest/shared';
import type { ContainerOverrides } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (nodeEnv: 'test' | 'production' = 'test') =>
  loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);

// A fake token, joined at runtime so the source never carries a credential-shaped literal.
const TOKEN = ['ghp', 'FAKETOKEN0123456789abcdefABCDEF01234'].join('_');

const FILES = {
  'specs/public-api.md': '# Public API\nAll public endpoints MUST be rate-limited.',
  '.devdigest/specs/security.md': '# Security baseline\nNo secrets in code.',
  'docs/architecture.md': '# Architecture\nModule api/ does not import db/ directly.',
  'insights/incident.md': '# Incident',
  'node_modules/pkg/docs/readme.md': 'never listed',
  'README.md': 'not under a root',
  'src/index.ts': 'export {}',
};

let seq = 0;

d('Project Context routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(opts: {
    git?: MockGitOptions;
    github?: MockGitHubClient | null;
    nodeEnv?: 'test' | 'production';
    extra?: ContainerOverrides;
  } = {}) {
    const git = new MockGitClient({ files: { ...FILES }, ...opts.git });
    const github = opts.github === undefined ? new MockGitHubClient() : opts.github;
    return {
      git,
      app: buildApp({
        config: config(opts.nodeEnv),
        db: pg.handle.db,
        overrides: {
          embedder: new MockEmbedder(),
          git,
          ...(github ? { github } : {}),
          secrets: new MockSecretsProvider(github ? { GITHUB_TOKEN: TOKEN } : {}),
          llm: { openai: new MockLLMProvider('openai', {}) },
          ...opts.extra,
        },
      }),
    };
  }

  async function newRepo() {
    const name = `ctx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, defaultBranch: 'main' })
      .returning();
    return repo!;
  }

  async function newAgent() {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `agent-${seq++}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'Review.' })
      .returning();
    return agent!;
  }

  async function newSkill(name = `skill-${seq++}`) {
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name, description: 'd', type: 'rubric', source: 'manual', body: 'b' })
      .returning();
    return skill!;
  }

  // ---------------------------------------------------------------- documents

  it('lists the root documents with type, tokens and used-by; excludes node_modules and non-roots (AC-1)', async () => {
    const { app } = appWith();
    const repo = await newRepo();
    const res = await (await app).inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const list = ContextDocList.parse(res.json());
    expect(list.state).toBe('ok');
    expect(list.roots).toEqual(['specs', 'docs', 'insights']);
    expect(list.documents.map((doc) => [doc.path, doc.type])).toEqual([
      ['.devdigest/specs/security.md', 'specs'],
      ['docs/architecture.md', 'docs'],
      ['insights/incident.md', 'insights'],
      ['specs/public-api.md', 'specs'],
    ]);
    expect(list.documents.every((doc) => (doc.tokens ?? 0) > 0)).toBe(true);
    expect(list.scanned_at).not.toBeNull();
  });

  it('lists at most 1,000 documents and counts the rest in total (AC-1, EC-15)', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [`docs/${String(i).padStart(4, '0')}.md`, `# Doc ${i}`]),
    );
    const { app } = appWith({ git: { files } });
    const repo = await newRepo();
    const list = ContextDocList.parse((await (await app).inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json());
    expect(list.total).toBe(1001);
    expect(list.documents).toHaveLength(1000);
  });

  it('returns the not-cloned state (AC-4)', async () => {
    const { app } = appWith({ git: { notCloned: true } });
    const repo = await newRepo();
    const list = ContextDocList.parse((await (await app).inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json());
    expect(list).toMatchObject({ state: 'not_cloned', total: 0, documents: [], scanned_at: null });
  });

  it('reads one document with tokens, version and used-by (AC-2)', async () => {
    const { app } = appWith();
    const repo = await newRepo();
    const agent = await newAgent();
    const a = await app;
    await a.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths: ['docs/architecture.md'] } });
    const res = await a.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/document?path=${encodeURIComponent('docs/architecture.md')}`,
    });
    expect(res.statusCode).toBe(200);
    const doc = ContextDocument.parse(res.json());
    expect(doc).toMatchObject({ path: 'docs/architecture.md', type: 'docs', text: FILES['docs/architecture.md'] });
    expect(doc.version).toBe(contentVersion(FILES['docs/architecture.md']));
    expect(doc.used_by_agents).toBeGreaterThanOrEqual(1);
    expect(doc.tokens).toBeGreaterThan(0);
  });

  it('never lists or reads a symlink, and rejects paths outside the roots (AC-8)', async () => {
    const { app } = appWith({
      git: { files: { ...FILES, 'docs/secrets.md': '{"token":"x"}' }, symlinks: ['docs/secrets.md'] },
    });
    const repo = await newRepo();
    const a = await app;
    const list = ContextDocList.parse((await a.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json());
    expect(list.documents.map((doc) => doc.path)).not.toContain('docs/secrets.md');
    const read = (path: string) =>
      a.inject({ method: 'GET', url: `/repos/${repo.id}/context/document?path=${encodeURIComponent(path)}` });
    expect((await read('docs/secrets.md')).statusCode).toBe(404);
    expect((await read('../secrets.md')).statusCode).toBe(422);
    expect((await read('README.md')).statusCode).toBe(422);
  });

  it('Rescan syncs the clone to the default branch and lists the new text (AC-3)', async () => {
    const { app, git } = appWith({
      git: { syncedFiles: { ...FILES, 'specs/new.md': '# New spec from upstream' } },
    });
    const repo = await newRepo();
    const res = await (await app).inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` });
    expect(res.statusCode).toBe(200);
    expect(git.syncs).toEqual([{ repo: { owner: 'acme', name: repo.name }, branch: 'main' }]);
    expect(ContextDocList.parse(res.json()).documents.map((doc) => doc.path)).toContain('specs/new.md');
  });

  it('Rescan answers 409 without a clone', async () => {
    const { app } = appWith({ git: { notCloned: true } });
    const repo = await newRepo();
    expect((await (await app).inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` })).statusCode).toBe(409);
  });

  it('serves 1,000 documents of 2 KB within 2 s once the token cache is warm (NFR-1)', async () => {
    const body = 'Module api/ must not import db/ directly. '.repeat(48).slice(0, 2048);
    const files = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`docs/d${i}.md`, `${i} ${body}`]));
    const { app } = appWith({ git: { files } });
    const repo = await newRepo();
    const a = await app;
    await a.inject({ method: 'GET', url: `/repos/${repo.id}/context` }); // warm
    const start = performance.now();
    const res = await a.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    expect(performance.now() - start).toBeLessThan(2000);
  });

  // -------------------------------------------------------------- attachments

  it('saves the ordered list, keeps it on reload and leaves the agent version unchanged (AC-10)', async () => {
    const { app } = appWith();
    const agent = await newAgent();
    const a = await app;
    const paths = ['specs/public-api.md', 'docs/architecture.md'];
    const put = await a.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths } });
    expect(put.statusCode).toBe(200);
    const got = ContextAttachments.parse((await a.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json());
    expect(got.items.map((i) => i.path)).toEqual(paths);
    expect(got.items.every((i) => i.status === 'unknown' && i.tokens === null)).toBe(true); // no repo → uncounted (AC-14)
    const [row] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    expect(row!.version).toBe(agent.version);
  });

  it('labels inherited, missing and too-large rows; the total matches the injected set (AC-12, AC-13)', async () => {
    const { app } = appWith({
      git: { files: { ...FILES, 'docs/huge.md': 'x'.repeat(1024 * 1024 + 1) } },
    });
    const repo = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill('pr-quality-rubric');
    await pg.handle.db.insert(t.agentSkills).values({ agentId: agent.id, skillId: skill.id, order: 0, enabled: true });
    const a = await app;
    await a.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['specs/public-api.md', 'insights/incident.md'] },
    });
    const res = await a.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context?repo_id=${repo.id}`,
      payload: { paths: ['specs/public-api.md', 'specs/gone.md', 'docs/huge.md'] },
    });
    expect(res.statusCode).toBe(200);
    const view = ContextAttachments.parse(res.json());
    expect(view.items.map((i) => [i.path, i.via_skill, i.status])).toEqual([
      ['specs/public-api.md', null, 'present'],
      ['specs/gone.md', null, 'not_in_repo'],
      ['docs/huge.md', null, 'too_large'],
      ['insights/incident.md', 'pr-quality-rubric', 'present'],
    ]);
    const counted = view.items.filter((i) => i.status === 'present').reduce((s, i) => s + (i.tokens ?? 0), 0);
    expect(view.total_tokens).toBe(counted);
    expect(view.budget).toBe(24000);
  });

  it('a disabled skill link contributes nothing (EC-4)', async () => {
    const { app } = appWith();
    const repo = await newRepo();
    const agent = await newAgent();
    const skill = await newSkill();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: agent.id, skillId: skill.id, order: 0, enabled: false });
    const a = await app;
    await a.inject({ method: 'PUT', url: `/skills/${skill.id}/context`, payload: { paths: ['insights/incident.md'] } });
    const view = ContextAttachments.parse(
      (await a.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` })).json(),
    );
    expect(view.items).toEqual([]);
  });

  it('rejects a bad list whole with 422 and the reason (AC-38)', async () => {
    const { app } = appWith();
    const agent = await newAgent();
    const a = await app;
    await a.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths: ['specs/public-api.md'] } });
    const put = (paths: string[]) => a.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths } });
    for (const paths of [
      ['../a.md'],
      ['/etc/a.md'],
      ['specs/a.txt'],
      ['specs/a.md', 'specs/a.md'],
      Array.from({ length: 101 }, (_, i) => `specs/${i}.md`),
    ]) {
      const res = await put(paths);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toBeTruthy();
    }
    const kept = ContextAttachments.parse((await a.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json());
    expect(kept.items.map((i) => i.path)).toEqual(['specs/public-api.md']);
  });

  it('answers 404 for an unknown agent, skill or repo (AC-39)', async () => {
    const { app } = appWith();
    const a = await app;
    const agent = await newAgent();
    expect((await a.inject({ method: 'GET', url: `/agents/${randomUUID()}/context` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'GET', url: `/skills/${randomUUID()}/context` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'GET', url: `/repos/${randomUUID()}/context` })).statusCode).toBe(404);
    expect(
      (await a.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${randomUUID()}` })).statusCode,
    ).toBe(404);
  });

  // --------------------------------------------------------------------- save

  it('commits to a NEW branch off the default branch and opens a PR; the clone is untouched (AC-29, AC-30)', async () => {
    const github = new MockGitHubClient({ files: { 'specs/public-api.md': FILES['specs/public-api.md'] } });
    const { app, git } = appWith({ github });
    const repo = await newRepo();
    const res = await (await app).inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/documents`,
      payload: {
        path: 'specs/public-api.md',
        text: '# Public API\nUpdated.',
        mode: 'update',
        base_version: contentVersion(FILES['specs/public-api.md'].replace(/\n/g, '\r\n')), // CRLF clone = LF GitHub
      },
    });
    expect(res.statusCode).toBe(201);
    const result = ContextSaveResult.parse(res.json());
    expect(result.branch).toMatch(/^devdigest\/context\/public-api-\d{14}$/);
    expect(result.pr_number).toBe(1);
    expect(github.committed).toEqual([
      {
        branch: result.branch,
        base: 'main',
        message: 'docs: update specs/public-api.md',
        files: [{ path: 'specs/public-api.md', contents: '# Public API\nUpdated.' }],
        createOnly: true,
      },
    ]);
    expect(github.openedPrs[0]).toMatchObject({ head: result.branch, base: 'main', title: 'docs: update specs/public-api.md' });
    expect(git.syncs).toEqual([]);
  });

  it('creates a new file with a custom message', async () => {
    const github = new MockGitHubClient({ files: {} });
    const { app } = appWith({ github });
    const repo = await newRepo();
    const res = await (await app).inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/documents`,
      payload: { path: 'docs/adr/0001.md', text: '# ADR', mode: 'create', message: 'docs: record ADR 1' },
    });
    expect(res.statusCode).toBe(201);
    expect(github.committed[0]).toMatchObject({ message: 'docs: record ADR 1', createOnly: true });
  });

  it('answers 409 when GitHub changed the file since the edit began, or it already exists (AC-31)', async () => {
    const github = new MockGitHubClient({ files: { 'specs/public-api.md': 'changed upstream' } });
    const { app } = appWith({ github });
    const repo = await newRepo();
    const a = await app;
    const update = await a.inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/documents`,
      payload: { path: 'specs/public-api.md', text: 'x', mode: 'update', base_version: contentVersion(FILES['specs/public-api.md']) },
    });
    expect(update.statusCode).toBe(409);
    expect(update.json().error).toMatchObject({ code: 'changed_upstream', message: 'Changed on GitHub. Rescan and reapply your edit.' });
    const create = await a.inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/documents`,
      payload: { path: 'specs/public-api.md', text: 'x', mode: 'create' },
    });
    expect(create.statusCode).toBe(409);
    expect(create.json().error.code).toBe('exists');
    expect(github.committed).toEqual([]);
  });

  it('answers 403 with the reason when no token is stored or GitHub refuses the write (AC-32)', async () => {
    const repo = await newRepo();
    const payload = { path: 'specs/new.md', text: '# New', mode: 'create' };
    const noToken = await (await appWith({ github: null }).app).inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/documents`,
      payload,
    });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json().error.code).toBe('github_token');

    const refused = new MockGitHubClient({ files: {}, commitError: 403 });
    const res = await (await appWith({ github: refused }).app).inject({
      method: 'POST',
      url: `/repos/${repo.id}/context/documents`,
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toContain('GitHub refused the write');
  });

  it('rejects bad names and oversized uploads with the reason (AC-33)', async () => {
    const github = new MockGitHubClient({ files: {} });
    const { app } = appWith({ github });
    const repo = await newRepo();
    const a = await app;
    const save = (path: string, text = '# x') =>
      a.inject({ method: 'POST', url: `/repos/${repo.id}/context/documents`, payload: { path, text, mode: 'create' } });
    expect((await save('specs/x.txt')).statusCode).toBe(422);
    expect((await save('../a.md')).statusCode).toBe(422);
    expect((await save('src/a.md')).json().error.details.reason).toBe('outside_roots');
    expect((await save('specs/big.md', 'x'.repeat(300 * 1024))).statusCode).toBe(413);
    expect(github.committed).toEqual([]);
  });

  // ---------------------------------------------------------- limits, secrets

  it('answers 429 on the 11th save and the 7th Rescan in a minute (NFR-5)', async () => {
    const github = new MockGitHubClient({ files: {} });
    const { app } = appWith({ github, nodeEnv: 'production' });
    const repo = await newRepo();
    const a = await app;
    const saves: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await a.inject({
        method: 'POST',
        url: `/repos/${repo.id}/context/documents`,
        payload: { path: `specs/n${i}.md`, text: '# n', mode: 'create' },
      });
      saves.push(res.statusCode);
    }
    expect(saves.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(saves[10]).toBe(429);
    const rescans: number[] = [];
    for (let i = 0; i < 7; i++) {
      rescans.push((await a.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` })).statusCode);
    }
    expect(rescans.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(rescans[6]).toBe(429);
  });

  it('never returns the GitHub token (NFR-6)', async () => {
    const github = new MockGitHubClient({ files: {}, commitError: 401 });
    const { app } = appWith({ github });
    const repo = await newRepo();
    const agent = await newAgent();
    const a = await app;
    const bodies = await Promise.all([
      a.inject({ method: 'GET', url: `/repos/${repo.id}/context` }),
      a.inject({ method: 'GET', url: `/agents/${agent.id}/context?repo_id=${repo.id}` }),
      a.inject({
        method: 'POST',
        url: `/repos/${repo.id}/context/documents`,
        payload: { path: 'specs/n.md', text: '# n', mode: 'create' },
      }),
    ]);
    for (const res of bodies) expect(res.body).not.toContain(TOKEN);
  });
});
