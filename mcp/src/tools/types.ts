/** Ring 2: the SDK-free tool contract. `server.ts` registers these and maps the results. */
import type { z } from 'zod';
import type { ToolResult } from '../format.js';
import type { ApiClient, Clock, Config, ProgressSink } from '../ports.js';

export interface ToolCtx {
  api: ApiClient;
  clock: Clock;
  config: Config;
  signal?: AbortSignal | undefined;
  progress?: ProgressSink | undefined;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputShape: S;
  annotations: ToolAnnotations;
  /** `args` is the parsed input (defaults applied). Never throws for expected failures. */
  run(args: z.output<z.ZodObject<S>>, ctx: ToolCtx): Promise<ToolResult>;
}

export const defineTool = <S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef<S> => def;
