import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ArchiveError, NodeZipReader, type ArchiveLimits } from '../src/adapters/archive/index.js';

/**
 * NodeZipReader — the in-memory zip reader behind the skill importer. No zip
 * library is installed, so the archives are built by hand below (local file
 * headers + central directory + end-of-central-directory record).
 */

// ---- tiny zip builder --------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipInput {
  path: string;
  content?: string | Buffer;
  /** 0 = stored, 8 = deflate. */
  method?: 0 | 8;
  /** Override the uncompressed size recorded in the headers (a lying header). */
  declaredSize?: number;
}

function buildZip(inputs: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const input of inputs) {
    const raw = Buffer.isBuffer(input.content)
      ? input.content
      : Buffer.from(input.content ?? '', 'utf8');
    const method = input.method ?? 0;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(input.path, 'utf8');
    const crc = crc32(raw);
    const size = input.declaredSize ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x800, 6); // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(inputs.length, 8);
  eocd.writeUInt16LE(inputs.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// ---- tests -----------------------------------------------------------------

const LIMITS: ArchiveLimits = { maxEntries: 10, maxEntryBytes: 1024, maxTotalBytes: 4096 };
const all = () => true;
const isMd = (p: string) => p.endsWith('.md');
const reader = new NodeZipReader();

describe('NodeZipReader', () => {
  it('decodes stored and deflated entries', () => {
    const zip = buildZip([
      { path: 'a.md', content: 'stored text' },
      { path: 'b.md', content: 'deflated text '.repeat(20), method: 8 },
    ]);
    const entries = reader.readZip(zip, LIMITS, all);
    expect(entries).toEqual([
      { path: 'a.md', size: 11, text: 'stored text' },
      { path: 'b.md', size: 280, text: 'deflated text '.repeat(20) },
    ]);
  });

  it('decodes UTF-8 content', () => {
    const zip = buildZip([{ path: 'u.md', content: 'héllo — ✓', method: 8 }]);
    expect(reader.readZip(zip, LIMITS, all)[0]!.text).toBe('héllo — ✓');
  });

  it('skips folder entries', () => {
    const zip = buildZip([
      { path: 'flaky/' },
      { path: 'flaky/SKILL.md', content: 'x' },
      { path: 'flaky/scripts/' },
    ]);
    expect(reader.readZip(zip, LIMITS, all).map((e) => e.path)).toEqual(['flaky/SKILL.md']);
  });

  it('lists entries the caller does not want, without decoding them', () => {
    const zip = buildZip([
      { path: 'SKILL.md', content: 'rules' },
      { path: 'scripts/run.sh', content: 'rm -rf /', method: 8 },
    ]);
    const entries = reader.readZip(zip, LIMITS, isMd);
    expect(entries).toEqual([
      { path: 'SKILL.md', size: 5, text: 'rules' },
      { path: 'scripts/run.sh', size: 8 },
    ]);
  });

  it('lists an entry over the per-entry limit without text', () => {
    const zip = buildZip([{ path: 'big.md', content: 'x'.repeat(2000), method: 8 }]);
    const [entry] = reader.readZip(zip, LIMITS, all);
    expect(entry).toEqual({ path: 'big.md', size: 2000 });
  });

  it('rejects an archive with too many entries', () => {
    const zip = buildZip(Array.from({ length: 11 }, (_, i) => ({ path: `f${i}.md`, content: 'x' })));
    expect(() => reader.readZip(zip, LIMITS, all)).toThrow(ArchiveError);
    expect(() => reader.readZip(zip, LIMITS, all)).toThrow(/11 entries/);
  });

  it('rejects an archive whose total uncompressed size exceeds the limit', () => {
    const zip = buildZip(
      Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.txt`, content: 'y'.repeat(1000), method: 8 as const })),
    );
    expect(() => reader.readZip(zip, LIMITS, () => false)).toThrow(/expands past 4096/);
  });

  it('stops a header that under-reports its size at maxOutputLength', () => {
    // Declares 10 bytes, actually inflates to 100 KB.
    const zip = buildZip([
      { path: 'bomb.md', content: 'z'.repeat(100_000), method: 8, declaredSize: 10 },
    ]);
    expect(() => reader.readZip(zip, LIMITS, all)).toThrow(ArchiveError);
    expect(() => reader.readZip(zip, LIMITS, all)).toThrow(/over the size limit/);
  });

  it('caps the ACTUAL decoded total when every header under-reports', () => {
    // Each entry declares 1 byte (passes the directory total) but inflates to
    // 1000 bytes (under the per-entry cap) — 5 of them decode past 4096.
    const zip = buildZip(
      Array.from({ length: 5 }, (_, i) => ({
        path: `f${i}.md`,
        content: 'q'.repeat(1000),
        method: 8 as const,
        declaredSize: 1,
      })),
    );
    expect(() => reader.readZip(zip, LIMITS, all)).toThrow(/expands past 4096/);
  });

  it('rejects a buffer that is not a zip', () => {
    expect(() => reader.readZip(Buffer.from('definitely not a zip file at all'), LIMITS, all)).toThrow(
      /Not a zip archive/,
    );
    expect(() => reader.readZip(Buffer.from('tiny'), LIMITS, all)).toThrow(ArchiveError);
  });
});
