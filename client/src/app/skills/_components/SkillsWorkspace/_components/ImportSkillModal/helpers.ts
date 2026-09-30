import { BASE64_CHUNK, IMPORT_EXTENSIONS, MAX_IMPORT_BYTES, NOTE_MAX } from "./constants";

export type ImportFileProblem = "bad_extension" | "too_large";

/** Reject a file before reading it: wrong extension or over the size cap. */
export function checkImportFile(file: { name: string; size: number }): ImportFileProblem | null {
  const name = file.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext))) return "bad_extension";
  if (file.size > MAX_IMPORT_BYTES) return "too_large";
  return null;
}

/**
 * Bytes → base64. `String.fromCharCode(...bytes)` on a whole file overflows the
 * call stack for large inputs, so the bytes are converted in fixed-size chunks.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return btoa(binary);
}

/** Read a picked/dropped file as base64 (FileReader works in browsers and jsdom). */
export function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(bytesToBase64(new Uint8Array(reader.result as ArrayBuffer)));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}

/** The v1 change note stored for an import, capped to the contract's length. */
export function importNote(template: string): string {
  return template.length > NOTE_MAX ? template.slice(0, NOTE_MAX - 1) + "…" : template;
}
