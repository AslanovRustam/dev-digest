import { z } from 'zod';

export const PluginInstallBody = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  source: z.string().optional(),
});
export type PluginInstallBody = z.infer<typeof PluginInstallBody>;

export const PluginToggleBody = z.object({ enabled: z.boolean() });
export type PluginToggleBody = z.infer<typeof PluginToggleBody>;
