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
}
