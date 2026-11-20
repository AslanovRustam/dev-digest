import type { BlastRadiusResponse } from '@devdigest/shared';

/**
 * What other modules may call on the blast module (through `container.blast`).
 * Never import `BlastService` directly from a sibling module.
 */
export interface BlastFacade {
  get(workspaceId: string, prId: string): Promise<BlastRadiusResponse>;
}
