import { describe, it, expect } from 'vitest';
import {
  autoVersionNote,
  classifyIgnoredFile,
  fallbackNameFor,
  findSkillEntry,
  ignoredReasonFor,
  importKindOf,
  isSkillContentChange,
  parseSkillMarkdown,
  ratio,
  restorePatch,
} from '../src/modules/skills/helpers.js';

/**
 * Pure rules of the skills module: the importer's markdown parser and archive
 * classification, and the version-bump rule. No I/O.
 */

describe('parseSkillMarkdown', () => {
  it('reads frontmatter scalars and strips them from the body', () => {
    const md = [
      '---',
      'name: flaky-tests',
      'description: Flag tests that depend on timing.',
      'type: rubric',
      '---',
      '',
      '# Flaky tests',
      '',
      'Look for sleeps.',
    ].join('\n');
    const p = parseSkillMarkdown(md, 'fallback');
    expect(p).toMatchObject({
      name: 'flaky-tests',
      description: 'Flag tests that depend on timing.',
      type: 'rubric',
      body: '# Flaky tests\n\nLook for sleeps.',
    });
    expect(p.warnings).toEqual([]);
  });

  it('unquotes single- and double-quoted values', () => {
    const md = `---\nname: "quoted: name"\ndescription: 'Use when: always'\n---\nbody`;
    const p = parseSkillMarkdown(md, 'x');
    expect(p.name).toBe('quoted: name');
    expect(p.description).toBe('Use when: always');
  });

  it('supports literal (|) and folded (>) blocks', () => {
    const lit = parseSkillMarkdown(
      `---\nname: a\ndescription: |\n  line one\n  line two\n---\nbody`,
      'x',
    );
    expect(lit.description).toBe('line one\nline two');
    const folded = parseSkillMarkdown(
      `---\nname: a\ndescription: >\n  line one\n  line two\n---\nbody`,
      'x',
    );
    expect(folded.description).toBe('line one line two');
  });

  it('handles CRLF line endings and a UTF-8 BOM', () => {
    const md = '﻿---\r\nname: crlf\r\ndescription: d\r\n---\r\nBody line\r\nsecond';
    const p = parseSkillMarkdown(md, 'x');
    expect(p.name).toBe('crlf');
    expect(p.description).toBe('d');
    expect(p.body).toBe('Body line\nsecond');
  });

  it('falls back to the first # heading, then to the fallback name', () => {
    expect(parseSkillMarkdown('# Heading Name\n\nbody', 'fb').name).toBe('Heading Name');
    expect(parseSkillMarkdown('no heading here', 'fb').name).toBe('fb');
    expect(parseSkillMarkdown('---\ndescription: d\n---\nplain', 'fb').name).toBe('fb');
  });

  it('defaults an unknown type to custom with a warning', () => {
    const p = parseSkillMarkdown('---\nname: a\ndescription: d\ntype: magic\n---\nbody', 'x');
    expect(p.type).toBe('custom');
    expect(p.warnings.some((w) => w.includes('magic'))).toBe(true);
  });

  it('accepts a type case-insensitively', () => {
    const p = parseSkillMarkdown('---\nname: a\ndescription: d\ntype: Security\n---\nbody', 'x');
    expect(p.type).toBe('security');
  });

  it('drops capability keys (allowed-tools, hooks) with a warning', () => {
    const p = parseSkillMarkdown(
      '---\nname: a\ndescription: d\nallowed-tools: Bash, Read\nhooks: pre\n---\nbody',
      'x',
    );
    expect(p.warnings.some((w) => w.includes('allowed-tools') && w.includes('hooks'))).toBe(true);
    expect(p).not.toHaveProperty('allowed-tools');
    expect(p.body).toBe('body');
  });

  it('warns when the description is missing', () => {
    const p = parseSkillMarkdown('---\nname: a\n---\nbody', 'x');
    expect(p.description).toBe('');
    expect(p.warnings.some((w) => w.toLowerCase().includes('description'))).toBe(true);
  });

  it('treats text without frontmatter as the body', () => {
    const p = parseSkillMarkdown('just rules', 'fb');
    expect(p.body).toBe('just rules');
    expect(p.type).toBe('custom');
  });
});

describe('findSkillEntry', () => {
  it('finds SKILL.md at the root (case-insensitive)', () => {
    expect(findSkillEntry(['Skill.md', 'notes.md'])).toBe('Skill.md');
  });

  it('finds SKILL.md inside a single top-level folder', () => {
    expect(findSkillEntry(['flaky/SKILL.md', 'flaky/notes.md', 'flaky/scripts/run.sh'])).toBe(
      'flaky/SKILL.md',
    );
  });

  it('prefers the root SKILL.md over a nested one', () => {
    expect(findSkillEntry(['a/SKILL.md', 'SKILL.md'])).toBe('SKILL.md');
  });

  it('ignores a SKILL.md nested deeper than one folder', () => {
    expect(findSkillEntry(['a/b/SKILL.md', 'a/b/other.md'])).toBeNull();
  });

  it('falls back to the only markdown file', () => {
    expect(findSkillEntry(['rules.md', 'image.png'])).toBe('rules.md');
  });

  it('returns null when ambiguous or absent', () => {
    expect(findSkillEntry(['a.md', 'b.md'])).toBeNull();
    expect(findSkillEntry(['run.sh'])).toBeNull();
    expect(findSkillEntry([])).toBeNull();
  });
});

describe('classifyIgnoredFile / ignoredReasonFor', () => {
  it('marks anything in a scripts/ folder as executable', () => {
    expect(classifyIgnoredFile('flaky/scripts/run.txt')).toBe('executable');
    expect(classifyIgnoredFile('scripts/README.md')).toBe('executable');
  });

  it('marks executable extensions', () => {
    expect(classifyIgnoredFile('run.sh')).toBe('executable');
    expect(classifyIgnoredFile('tool/check.py')).toBe('executable');
    expect(classifyIgnoredFile('bin.EXE')).toBe('executable');
  });

  it('marks extra markdown and other files', () => {
    expect(classifyIgnoredFile('flaky/notes.md')).toBe('extra_markdown');
    expect(classifyIgnoredFile('flaky/diagram.png')).toBe('non_markdown');
  });

  it('marks oversized markdown as too_large, leaves the rest alone', () => {
    expect(ignoredReasonFor('notes.md', 300, 256)).toBe('too_large');
    expect(ignoredReasonFor('notes.md', 100, 256)).toBe('extra_markdown');
    expect(ignoredReasonFor('big.png', 300, 256)).toBe('non_markdown');
    expect(ignoredReasonFor('scripts/big.sh', 300, 256)).toBe('executable');
  });
});

describe('import naming', () => {
  it('selects the importer by extension', () => {
    expect(importKindOf('x.MD')).toBe('markdown');
    expect(importKindOf('x.markdown')).toBe('markdown');
    expect(importKindOf('x.zip')).toBe('zip');
    expect(importKindOf('x.tar.gz')).toBeNull();
    expect(importKindOf('noext')).toBeNull();
  });

  it('names a skill after its folder, else the archive', () => {
    expect(fallbackNameFor('flaky/SKILL.md', 'bundle.zip')).toBe('flaky');
    expect(fallbackNameFor('SKILL.md', 'bundle.zip')).toBe('bundle');
  });
});

describe('versioning rules', () => {
  const existing = { name: 'a', description: 'd', type: 'custom' as const, body: 'b' };

  it('isSkillContentChange ignores unchanged and absent fields', () => {
    expect(isSkillContentChange(existing, {})).toBe(false);
    expect(isSkillContentChange(existing, { name: 'a', body: 'b' })).toBe(false);
    expect(isSkillContentChange(existing, { body: 'b2' })).toBe(true);
    expect(isSkillContentChange(existing, { type: 'rubric' })).toBe(true);
  });

  it('autoVersionNote lists the changed fields in a fixed order', () => {
    expect(autoVersionNote(existing, { description: 'x', body: 'y' })).toBe(
      'Edited body, description',
    );
    expect(autoVersionNote(existing, { name: 'n', body: 'b' })).toBe('Edited name');
    expect(autoVersionNote(existing, {})).toBe('Edited');
  });

  it('restorePatch carries the body plus recorded fields only', () => {
    expect(restorePatch({ body: 'b1', name: null, description: null, type: null })).toEqual({
      body: 'b1',
    });
    expect(restorePatch({ body: 'b1', name: 'n', description: '', type: 'rubric' })).toEqual({
      body: 'b1',
      name: 'n',
      description: '',
      type: 'rubric',
    });
  });

  it('ratio is null on an empty denominator', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 0)).toBeNull();
  });
});
