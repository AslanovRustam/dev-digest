import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * L02 — the agent side of skills: `PUT /agents/:id/skills` replaces the ordered
 * set (order + per-agent `enabled`) in one transaction and rejects skills from
 * another workspace; `skill_count` on the agent counts only skills that reach
 * the prompt (link enabled AND skill enabled). Skills are inserted straight into
 * the DB so this suite does not depend on the /skills module.
 */
d('agent ⇄ skill links', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    otherWorkspaceId = other!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  let skillSeq = 0;
  async function insertSkill(opts: { workspaceId?: string; enabled?: boolean } = {}) {
    const n = skillSeq++;
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: opts.workspaceId ?? workspaceId,
        name: `skill-${n}`,
        description: `Skill number ${n}`,
        type: 'convention',
        source: 'manual',
        body: `Rule ${n}.`,
        enabled: opts.enabled ?? true,
      })
      .returning();
    return row!;
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('PUT replaces the ordered set; GET returns order + enabled', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Linker');
    const [a, b, c] = [await insertSkill(), await insertSkill(), await insertSkill()];

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: c.id, enabled: true },
          { skill_id: a.id, enabled: false },
          { skill_id: b.id, enabled: true },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const expected = [
      { agent_id: agentId, skill_id: c.id, order: 0, enabled: true },
      { agent_id: agentId, skill_id: a.id, order: 1, enabled: false },
      { agent_id: agentId, skill_id: b.id, order: 2, enabled: true },
    ];
    expect(put.json()).toEqual(expected);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual(expected);

    // A second PUT fully replaces (drops c, reorders).
    const again = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: b.id, enabled: true }, { skill_id: a.id, enabled: true }] },
    });
    expect(again.json()).toEqual([
      { agent_id: agentId, skill_id: b.id, order: 0, enabled: true },
      { agent_id: agentId, skill_id: a.id, order: 1, enabled: true },
    ]);

    // Empty set unlinks everything.
    const cleared = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [] },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual([]);
    await app.close();
  });

  it('a foreign or unknown skill id → 422 and the links are unchanged', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Guarded');
    const mine = await insertSkill();
    const foreign = await insertSkill({ workspaceId: otherWorkspaceId });

    const initial = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: mine.id, enabled: true }] },
    });
    expect(initial.statusCode).toBe(200);

    const withForeign = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: foreign.id, enabled: true },
          { skill_id: mine.id, enabled: false },
        ],
      },
    });
    expect(withForeign.statusCode).toBe(422);

    const withUnknown = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: { items: [{ skill_id: '00000000-0000-0000-0000-000000000001', enabled: true }] },
    });
    expect(withUnknown.statusCode).toBe(422);

    const duplicate = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: mine.id, enabled: true },
          { skill_id: mine.id, enabled: false },
        ],
      },
    });
    expect(duplicate.statusCode).toBe(422);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links).toEqual([{ agent_id: agentId, skill_id: mine.id, order: 0, enabled: true }]);
    await app.close();
  });

  it('unknown agent → 404 on PUT and GET', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${ghost}/skills`,
      payload: { items: [] },
    });
    expect(put.statusCode).toBe(404);
    const get = await app.inject({ method: 'GET', url: `/agents/${ghost}/skills` });
    expect(get.statusCode).toBe(404);
    await app.close();
  });

  it('skill_count on GET /agents and /agents/:id respects both switches', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Counter');
    const on1 = await insertSkill();
    const on2 = await insertSkill();
    const linkOff = await insertSkill();
    const globalOff = await insertSkill({ enabled: false });

    const countOf = async () => {
      const one = (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json();
      const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
      const inList = list.find((a: { id: string }) => a.id === agentId);
      expect(inList.skill_count).toBe(one.skill_count);
      return one.skill_count as number;
    };

    expect(await countOf()).toBe(0);

    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills`,
      payload: {
        items: [
          { skill_id: on1.id, enabled: true },
          { skill_id: linkOff.id, enabled: false },
          { skill_id: globalOff.id, enabled: true },
          { skill_id: on2.id, enabled: true },
        ],
      },
    });
    expect(await countOf()).toBe(2);

    // Flip the global switch on the previously-off skill → it now counts.
    await pg.handle.db.update(t.skills).set({ enabled: true }).where(eq(t.skills.id, globalOff.id));
    expect(await countOf()).toBe(3);

    // Disable a counted skill globally → it drops out even though its link is on.
    await pg.handle.db.update(t.skills).set({ enabled: false }).where(eq(t.skills.id, on1.id));
    expect(await countOf()).toBe(2);
    await app.close();
  });

  it('the legacy POST /agents/:id/skills still links with enabled = true', async () => {
    const app = await makeApp();
    const agentId = await createAgent(app, 'Legacy');
    const s1 = await insertSkill();
    const s2 = await insertSkill();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [s2.id, s1.id] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual([
      { agent_id: agentId, skill_id: s2.id, order: 0, enabled: true },
      { agent_id: agentId, skill_id: s1.id, order: 1, enabled: true },
    ]);
    await app.close();
  });
});
