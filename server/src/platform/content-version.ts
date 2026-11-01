import { createHash } from 'node:crypto';

/**
 * Version of a text document: sha256 hex of its LF-normalised text. A Windows
 * clone checks files out with CRLF while GitHub serves LF, so the same file
 * must get the same version on both sides (Project Context edit conflicts).
 */
export function contentVersion(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}
