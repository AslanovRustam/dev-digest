import type { FastifyPluginAsync } from 'fastify';
import repos from './repos/routes.js';
import digests from './digests/routes.js';

/**
 * Module registry. Each feature module is a Fastify plugin in
 * `modules/<name>/routes.ts`. Registered here in one place.
 *
 * ADD A MODULE: create `modules/<name>/routes.ts` exporting a default Fastify
 * plugin, then add one import + one entry below. (We register statically rather
 * than via filesystem autoload so the same code path works under tsx, the
 * bundler, and vitest — native dynamic import() of .ts files is not portable.)
 */
export const modules: Record<string, FastifyPluginAsync> = {
  repos,
  digests,
};
