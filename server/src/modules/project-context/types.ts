import type {
  ContextAttachments,
  ContextDocList,
  ContextDocRead,
  ContextDocument,
  ContextSaveRequest,
  ContextSaveResult,
} from '@devdigest/shared';
import type { RepoRow } from '../../db/rows.js';

/**
 * Project Context — cross-module contract. `reviews` reaches it ONLY through
 * `container.projectContext`, typed by this file; it never imports
 * `project-context/service`. Type imports only.
 */

/** Whose attachment list a Context tab edits. */
export interface AttachmentOwner {
  kind: 'agent' | 'skill';
  id: string;
}

/** What a review run gets: the documents for the prompt and one trace entry per attachment. */
export interface ReviewProjectContext {
  /** In prompt order (the engine's `specs`); empty = the section is omitted. */
  documents: { path: string; text: string }[];
  /** → `RunTrace.context_documents`; empty when nothing is attached. */
  reads: ContextDocRead[];
}

/** What the PR brief gets: every enabled agent's attached documents, merged and unbudgeted. */
export interface BriefDocuments {
  documents: { path: string; text: string; tokens: number }[];
  /** Why `documents` is empty: no attachments, no clone, or none of them could be read. */
  missing: 'none_attached' | 'not_cloned' | 'unreadable' | null;
  /** Paths that could not be read while at least one other document was; absent = none. */
  unreadable?: string[];
}

export interface ProjectContextFacade {
  list(workspaceId: string, repoId: string): Promise<ContextDocList>;
  document(workspaceId: string, repoId: string, path: string): Promise<ContextDocument>;
  /** Sync the clone to the latest default branch, then list again. */
  rescan(workspaceId: string, repoId: string): Promise<ContextDocList>;
  /** `repoId` absent → paths only, uncounted. */
  getAttachments(workspaceId: string, owner: AttachmentOwner, repoId?: string): Promise<ContextAttachments>;
  setAttachments(
    workspaceId: string,
    owner: AttachmentOwner,
    paths: string[],
    repoId?: string,
  ): Promise<ContextAttachments>;
  /** Commit to a NEW branch off the default branch and open a PR; the clone is never written. */
  save(workspaceId: string, repoId: string, req: ContextSaveRequest): Promise<ContextSaveResult>;
  /** The agent's merged, budgeted documents for a run on `repo`. Never throws. */
  forReview(agentId: string, repo: RepoRow): Promise<ReviewProjectContext>;
  /** The union of every enabled agent's attached documents on `repo`, unbudgeted. Never throws. */
  forBrief(workspaceId: string, repo: RepoRow): Promise<BriefDocuments>;
}
