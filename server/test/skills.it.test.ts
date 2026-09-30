import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/** Minimal stored-only zip (local headers + central directory + EOCD). */
function buildStoredZip(files: Record<string, string>): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b: Buffer) => {
    let c = 0xffffffff;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const name = Buffer.from(path, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centrals.length / 2, 8);
  eocd.writeUInt16LE(centrals.length / 2, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

/**
 * /skills — CRUD with content versioning, restore, the import preview (parse
 * only) and the 30-day correlational stats, against a real Postgres.
 */
d('/skills', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const createBody = {
    name: 'no-sleeps',
    description: 'Flag tests that sleep.',
    type: 'rubric' as const,
    body: 'Flag `sleep()` in tests.',
  };

  async function create(payload: Record<string, unknown> = createBody) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  describe('CRUD', () => {
    it('creates a skill (201) with v1, manual source and no usage', async () => {
      const skill = await create();
      expect(skill).toMatchObject({
        ...createBody,
        source: 'manual',
        enabled: true,
        version: 1,
        agent_count: 0,
        pull_rate: null,
        accept_rate: null,
      });

      const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
      expect(got.statusCode).toBe(200);
      expect(got.json()).toMatchObject({ id: skill.id, version: 1, agent_count: 0 });

      const versions = (
        await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
      ).json();
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        skill_id: skill.id,
        version: 1,
        note: 'Initial version',
        name: 'no-sleeps',
        description: 'Flag tests that sleep.',
        type: 'rubric',
        body: 'Flag `sleep()` in tests.',
      });
    });

    it('stores the create note on v1 and defaults imported files to disabled', async () => {
      const skill = await create({ ...createBody, name: 'imp', source: 'imported_file', note: ' from zip ' });
      expect(skill).toMatchObject({ source: 'imported_file', enabled: false });
      const [v1] = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
      expect(v1.note).toBe('from zip');
    });

    it('lists workspace skills', async () => {
      const res = await app.inject({ method: 'GET', url: '/skills' });
      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]).toHaveProperty('agent_count');
    });

    it('404s an unknown uuid and 422s a bad body / bad id', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      expect((await app.inject({ method: 'GET', url: `/skills/${unknown}` })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: 'PUT', url: `/skills/${unknown}`, payload: { body: 'x' } }))
          .statusCode,
      ).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/skills/${unknown}` })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: 'GET', url: `/skills/${unknown}/versions` })).statusCode,
      ).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/skills/${unknown}/stats` })).statusCode).toBe(
        404,
      );
      expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid' })).statusCode).toBe(422);
      const bad = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: '', type: 'nope', body: '' },
      });
      expect(bad.statusCode).toBe(422);
    });

    it('deletes a skill', async () => {
      const skill = await create({ ...createBody, name: 'doomed' });
      const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
      expect(del.statusCode).toBe(200);
      expect(del.json()).toEqual({ ok: true });
      expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    });
  });

  describe('versioning', () => {
    it('bumps on a content change with the note or an automatic one; toggling enabled does not', async () => {
      const skill = await create({ ...createBody, name: 'versioned' });
      const url = `/skills/${skill.id}`;

      const v2 = await app.inject({
        method: 'PUT',
        url,
        payload: { body: 'Flag sleeps and timers.', note: 'Cover timers' },
      });
      expect(v2.statusCode).toBe(200);
      expect(v2.json()).toMatchObject({ version: 2, body: 'Flag sleeps and timers.' });

      const v3 = await app.inject({
        method: 'PUT',
        url,
        payload: { description: 'Flag sleeping tests.', body: 'Body v3' },
      });
      expect(v3.json().version).toBe(3);

      const toggled = await app.inject({ method: 'PUT', url, payload: { enabled: false } });
      expect(toggled.json()).toMatchObject({ version: 3, enabled: false });

      // Same content + a note is not a change either.
      const same = await app.inject({ method: 'PUT', url, payload: { body: 'Body v3', note: 'noop' } });
      expect(same.json().version).toBe(3);

      const versions = (await app.inject({ method: 'GET', url: `${url}/versions` })).json();
      expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
      expect(versions.map((v: { note: string }) => v.note)).toEqual([
        'Edited body, description',
        'Cover timers',
        'Initial version',
      ]);
      expect(versions[0]).toMatchObject({ description: 'Flag sleeping tests.', body: 'Body v3' });
    });

    it('restores vK as a new version and no-ops when content already matches', async () => {
      const skill = await create({ ...createBody, name: 'restorable' });
      const url = `/skills/${skill.id}`;
      await app.inject({ method: 'PUT', url, payload: { name: 'renamed', body: 'Body v2' } });

      const restored = await app.inject({ method: 'POST', url: `${url}/versions/1/restore` });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({
        version: 3,
        name: 'restorable',
        body: createBody.body,
      });
      const [latest] = (await app.inject({ method: 'GET', url: `${url}/versions` })).json();
      expect(latest).toMatchObject({ version: 3, note: 'Restored v1' });

      const again = await app.inject({ method: 'POST', url: `${url}/versions/3/restore` });
      expect(again.json().version).toBe(3);

      expect((await app.inject({ method: 'POST', url: `${url}/versions/9/restore` })).statusCode).toBe(
        404,
      );
      expect((await app.inject({ method: 'POST', url: `${url}/versions/0/restore` })).statusCode).toBe(
        422,
      );
    });
  });

  describe('import preview', () => {
    const skillCount = async () => (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    it('parses a .md file', async () => {
      const before = await skillCount();
      const md = '---\nname: corner-cases\ndescription: Flag missed boundaries.\ntype: rubric\n---\n# Corner cases\n\nCheck 0 and max.';
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: { filename: 'corner-cases.md', content_base64: b64(md) },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        name: 'corner-cases',
        description: 'Flag missed boundaries.',
        type: 'rubric',
        body: '# Corner cases\n\nCheck 0 and max.',
        source_file: 'corner-cases.md',
        ignored_files: [],
        warnings: [],
      });
      expect(await skillCount()).toBe(before);
    });

    it('extracts SKILL.md from a .zip and lists every other file, storing nothing', async () => {
      const before = await skillCount();
      const zip = buildStoredZip({
        'flaky/SKILL.md':
          '---\nname: flaky-tests\ndescription: Flag timing-dependent tests.\nallowed-tools: Bash\n---\nLook for sleeps.',
        'flaky/scripts/run.sh': '#!/bin/sh\necho pwned > /tmp/pwned',
        'flaky/notes.md': '# notes',
        'flaky/logo.png': 'PNG',
      });
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: { filename: 'flaky.zip', content_base64: b64(zip) },
      });
      expect(res.statusCode).toBe(200);
      const preview = res.json();
      expect(preview).toMatchObject({
        name: 'flaky-tests',
        description: 'Flag timing-dependent tests.',
        type: 'custom',
        body: 'Look for sleeps.',
        source_file: 'flaky/SKILL.md',
      });
      expect(preview.ignored_files).toEqual([
        { path: 'flaky/scripts/run.sh', reason: 'executable' },
        { path: 'flaky/notes.md', reason: 'extra_markdown' },
        { path: 'flaky/logo.png', reason: 'non_markdown' },
      ]);
      expect(preview.warnings.some((w: string) => w.includes('allowed-tools'))).toBe(true);
      expect(await skillCount()).toBe(before);
    });

    it('422s an unsupported extension, a zip without SKILL.md, and a broken zip', async () => {
      const ext = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: { filename: 'skill.txt', content_base64: b64('hello') },
      });
      expect(ext.statusCode).toBe(422);
      expect(ext.json().error.message).toMatch(/Unsupported file type/);

      const noSkill = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: {
          filename: 'x.zip',
          content_base64: b64(buildStoredZip({ 'a.md': 'a', 'b.md': 'b', 'run.sh': 'x' })),
        },
      });
      expect(noSkill.statusCode).toBe(422);
      expect(noSkill.json().error.message).toMatch(/No SKILL.md/);

      const broken = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: { filename: 'x.zip', content_base64: b64('not a zip at all, sorry') },
      });
      expect(broken.statusCode).toBe(422);

      const empty = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: { filename: 'x.md', content_base64: b64('---\nname: a\n---\n   ') },
      });
      expect(empty.statusCode).toBe(422);
    });
  });

  describe('stats', () => {
    it('correlates pulled runs, their findings and the accept rate', async () => {
      const db = pg.handle.db;
      const skill = await create({ ...createBody, name: 'stats-skill' });
      const other = await create({ ...createBody, name: 'other-skill' });
      const [pr] = await db
        .select()
        .from(t.pullRequests)
        .where(eq(t.pullRequests.workspaceId, workspaceId));

      const agentBase = {
        workspaceId,
        provider: 'openai' as const,
        model: 'gpt-4o-mini',
        systemPrompt: 'Review.',
      };
      const [agentA] = await db
        .insert(t.agents)
        .values({ ...agentBase, name: 'A stats agent' })
        .returning();
      const [agentB] = await db
        .insert(t.agents)
        .values({ ...agentBase, name: 'B stats agent', enabled: false })
        .returning();
      await db.insert(t.agentSkills).values([
        { agentId: agentA!.id, skillId: skill.id, order: 0, enabled: true },
        { agentId: agentB!.id, skillId: skill.id, order: 0, enabled: false },
      ]);

      const runRow = (status: string, ranAt = new Date()) => ({
        workspaceId,
        agentId: agentA!.id,
        prId: pr!.id,
        status,
        ranAt,
      });
      const [pulled, notPulled, noTrace, failed, old] = await db
        .insert(t.agentRuns)
        .values([
          runRow('done'),
          runRow('done'),
          runRow('done'),
          runRow('failed'),
          runRow('done', new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)),
        ])
        .returning();
      const traceWith = (skillIds: string[]) => ({
        prompt_assembly: {
          system: 's',
          user: 'u',
          skill_blocks: skillIds.map((id) => ({
            skill_id: id,
            name: 'n',
            type: 'rubric',
            version: 1,
            tokens: 10,
            text: '### Skill: n',
          })),
        },
      });
      await db.insert(t.runTraces).values([
        { runId: pulled!.id, trace: traceWith([other.id, skill.id]) },
        { runId: notPulled!.id, trace: traceWith([other.id]) },
        { runId: failed!.id, trace: traceWith([skill.id]) },
        { runId: old!.id, trace: traceWith([skill.id]) },
      ]);
      void noTrace;

      const reviewRow = (runId: string) => ({
        workspaceId,
        prId: pr!.id,
        agentId: agentA!.id,
        runId,
        kind: 'review' as const,
      });
      const [pulledReview, otherReview] = await db
        .insert(t.reviews)
        .values([reviewRow(pulled!.id), reviewRow(notPulled!.id)])
        .returning();
      const finding = (reviewId: string, category: string, state?: 'accepted' | 'dismissed') => ({
        reviewId,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category,
        title: 't',
        rationale: 'r',
        confidence: 0.9,
        ...(state === 'accepted' ? { acceptedAt: new Date() } : {}),
        ...(state === 'dismissed' ? { dismissedAt: new Date() } : {}),
      });
      await db.insert(t.findings).values([
        finding(pulledReview!.id, 'testing', 'accepted'),
        finding(pulledReview!.id, 'testing', 'dismissed'),
        finding(pulledReview!.id, 'testing'),
        finding(pulledReview!.id, 'correctness', 'accepted'),
        finding(otherReview!.id, 'style', 'dismissed'),
      ]);

      const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
      expect(res.statusCode).toBe(200);
      const stats = res.json();
      expect(stats).toMatchObject({
        skill_id: skill.id,
        window_days: 30,
        used_by: 2,
        runs_total: 3,
        runs_pulled: 1,
        findings: 4,
        accepted: 2,
        dismissed: 1,
      });
      expect(stats.pull_rate).toBeCloseTo(1 / 3);
      expect(stats.accept_rate).toBeCloseTo(2 / 3);
      expect(stats.by_category).toEqual([
        { category: 'testing', count: 3 },
        { category: 'correctness', count: 1 },
      ]);
      expect(stats.agents).toEqual([
        { id: agentA!.id, name: 'A stats agent', agent_enabled: true, link_enabled: true },
        { id: agentB!.id, name: 'B stats agent', agent_enabled: false, link_enabled: false },
      ]);

      // No links → zero usage, null rates.
      const otherStats = (await app.inject({ method: 'GET', url: `/skills/${other.id}/stats` })).json();
      expect(otherStats).toMatchObject({
        used_by: 0,
        runs_total: 0,
        runs_pulled: 0,
        pull_rate: null,
        findings: 0,
        accept_rate: null,
        by_category: [],
        agents: [],
      });

      const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
      const listed = list.find((s: { id: string }) => s.id === skill.id);
      expect(listed.agent_count).toBe(2);
      expect(listed.pull_rate).toBeCloseTo(1 / 3);
      expect(listed.accept_rate).toBeCloseTo(2 / 3);
      const listedOther = list.find((s: { id: string }) => s.id === other.id);
      expect(listedOther).toMatchObject({ agent_count: 0, pull_rate: null, accept_rate: null });

      const one = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
      expect(one.agent_count).toBe(2);
      expect(one.pull_rate).toBeCloseTo(1 / 3);
      expect(one.accept_rate).toBeCloseTo(2 / 3);

      // Deleting the skill cascades its agent links.
      await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
      const links = await db.select().from(t.agentSkills).where(eq(t.agentSkills.skillId, skill.id));
      expect(links).toHaveLength(0);
    });
  });
});
