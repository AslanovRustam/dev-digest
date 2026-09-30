/**
 * archive adapter — a read-only, in-memory .zip reader for the skill importer.
 *
 * Deliberately minimal: it parses the central directory, lists entries, and
 * inflates ONLY the entries the caller asks for, straight into memory. Nothing
 * is ever written to disk or executed — an archive is data. Built on node:zlib
 * (no third-party unzip dependency).
 *
 * Zip-bomb guards: entry count, per-entry and total uncompressed size are
 * checked against the central directory BEFORE inflating, and `inflateRawSync`
 * gets a `maxOutputLength` so a header that lies about its size still can't
 * expand past the limit. Unsupported: zip64, encryption, methods other than
 * stored (0) / deflate (8) — those raise `ArchiveError`.
 *
 * Swappable in tests via ContainerOverrides.archive.
 */
import { inflateRawSync } from 'node:zlib';

export interface ArchiveLimits {
  /** Max entries (files + folders) in the central directory. */
  maxEntries: number;
  /** Max uncompressed size of a single entry that is read. */
  maxEntryBytes: number;
  /** Max summed uncompressed size across ALL entries. */
  maxTotalBytes: number;
}

export interface ArchiveEntry {
  /** Normalised forward-slash path inside the archive. */
  path: string;
  /** Uncompressed size from the central directory. */
  size: number;
  /** UTF-8 content — present only for entries selected by `want`. */
  text?: string;
}

export interface ArchiveReader {
  /**
   * List the files of a zip (folders are skipped) and decode the ones `want`
   * selects as UTF-8 text. Throws `ArchiveError` on a malformed/oversized zip.
   */
  readZip(buf: Buffer, limits: ArchiveLimits, want: (path: string) => boolean): ArchiveEntry[];
}

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_MIN = 22;
const ZIP64_MARK = 0xffffffff;

interface CdEntry {
  path: string;
  method: number;
  flags: number;
  compSize: number;
  size: number;
  localOffset: number;
}

export class NodeZipReader implements ArchiveReader {
  readZip(buf: Buffer, limits: ArchiveLimits, want: (path: string) => boolean): ArchiveEntry[] {
    const entries = this.centralDirectory(buf, limits);
    const out: ArchiveEntry[] = [];
    // The central directory's sizes are self-declared; count what inflation
    // ACTUALLY produced too, so lying headers can't exceed maxTotalBytes.
    let decoded = 0;
    for (const e of entries) {
      if (e.path.endsWith('/')) continue; // folder
      const entry: ArchiveEntry = { path: e.path, size: e.size };
      if (want(e.path) && e.size <= limits.maxEntryBytes) {
        entry.text = this.inflate(buf, e, limits);
        decoded += Buffer.byteLength(entry.text);
        if (decoded > limits.maxTotalBytes) {
          throw new ArchiveError(`Archive expands past ${limits.maxTotalBytes} bytes`);
        }
      }
      out.push(entry);
    }
    return out;
  }

  private centralDirectory(buf: Buffer, limits: ArchiveLimits): CdEntry[] {
    const eocd = this.findEocd(buf);
    const count = buf.readUInt16LE(eocd + 10);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (count > limits.maxEntries) {
      throw new ArchiveError(`Archive has ${count} entries (limit ${limits.maxEntries})`);
    }
    if (cdOffset === ZIP64_MARK) throw new ArchiveError('zip64 archives are not supported');

    const entries: CdEntry[] = [];
    let total = 0;
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH_SIG) {
        throw new ArchiveError('Corrupt zip: bad central directory');
      }
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      if (compSize === ZIP64_MARK || size === ZIP64_MARK || localOffset === ZIP64_MARK) {
        throw new ArchiveError('zip64 archives are not supported');
      }
      const utf8 = (flags & 0x800) !== 0;
      const raw = buf.subarray(p + 46, p + 46 + nameLen);
      const path = (utf8 ? raw.toString('utf8') : raw.toString('latin1')).replaceAll('\\', '/');
      total += size;
      if (total > limits.maxTotalBytes) {
        throw new ArchiveError(`Archive expands past ${limits.maxTotalBytes} bytes`);
      }
      entries.push({ path, method, flags, compSize, size, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  private findEocd(buf: Buffer): number {
    if (buf.length < EOCD_MIN) throw new ArchiveError('Not a zip archive');
    const stop = Math.max(0, buf.length - EOCD_MIN - 0xffff);
    for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
      if (buf.readUInt32LE(i) === EOCD_SIG) return i;
    }
    throw new ArchiveError('Not a zip archive');
  }

  private inflate(buf: Buffer, e: CdEntry, limits: ArchiveLimits): string {
    if ((e.flags & 0x1) !== 0) throw new ArchiveError(`Encrypted entry: ${e.path}`);
    const p = e.localOffset;
    if (p + 30 > buf.length || buf.readUInt32LE(p) !== LFH_SIG) {
      throw new ArchiveError(`Corrupt zip: bad local header for ${e.path}`);
    }
    const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
    const data = buf.subarray(start, start + e.compSize);
    if (e.method === 0) return data.toString('utf8');
    if (e.method !== 8) throw new ArchiveError(`Unsupported compression for ${e.path}`);
    try {
      return inflateRawSync(data, { maxOutputLength: limits.maxEntryBytes }).toString('utf8');
    } catch {
      throw new ArchiveError(`Could not inflate ${e.path} (corrupt or over the size limit)`);
    }
  }
}
