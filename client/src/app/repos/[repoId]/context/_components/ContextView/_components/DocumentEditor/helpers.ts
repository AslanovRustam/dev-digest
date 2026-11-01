import { ApiError } from "@/lib/api";

/** Default commit message (and PR title) — the API applies the same one. */
export function defaultCommitMessage(mode: "create" | "update", path: string): string {
  return `docs: ${mode === "create" ? "add" : "update"} ${path}`;
}

/**
 * Where a failed save is shown — the text is always kept:
 *  - `field`   bad name, existing file, over 256 KB (AC-33) — by the path field
 *  - `changed` GitHub's default branch moved on (AC-31)
 *  - `github`  no token / GitHub refused the write (AC-32) — with a Settings link
 *  - `retry`   network or 5xx (AC-7)
 *  - `banner`  anything else (rate limit, …)
 */
export type SaveErrorView =
  | { place: "field"; message: string }
  | { place: "changed" }
  | { place: "github"; message: string }
  | { place: "retry"; message: string }
  | { place: "banner"; message: string };

export function saveErrorView(err: unknown): SaveErrorView | null {
  if (!err) return null;
  if (!(err instanceof ApiError)) return { place: "retry", message: err instanceof Error ? err.message : String(err) };
  if (err.status === 409 && err.code === "changed_upstream") return { place: "changed" };
  if (err.status === 403) return { place: "github", message: err.message };
  if (err.status === 422 || err.status === 413 || (err.status === 409 && err.code === "exists")) {
    return { place: "field", message: err.message };
  }
  if (err.status === 0 || err.status >= 500) return { place: "retry", message: err.message };
  return { place: "banner", message: err.message };
}
