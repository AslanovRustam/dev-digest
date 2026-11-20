/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export { prefersReducedMotion } from "./helpers";
export { FOCUS_FLASH_MS } from "./constants";
export type { DiffFocus } from "./helpers";
export type { DiffAnnotation, DiffAnnotationApi } from "./annotations";
