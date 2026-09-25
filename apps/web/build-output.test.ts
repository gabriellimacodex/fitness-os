import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = __dirname;
const nextBin = join(webRoot, 'node_modules', '.bin', 'next');

interface AppPathRoutesManifest {
  readonly [appPath: string]: string;
}

interface PrerenderManifest {
  readonly routes: Readonly<Record<string, unknown>>;
  readonly dynamicRoutes: Readonly<Record<string, unknown>>;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(webRoot, relativePath), 'utf8')) as T;
}

describe('production build output — movement route freshness', () => {
  it('renders /movements and /movements/[movementId] as dynamic, with no prerendered movement payload', () => {
    const stdout = execFileSync(nextBin, ['build'], {
      cwd: webRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8',
    });

    // Human-readable route table Next prints at the end of `next build`:
    // "ƒ" marks a route as server-rendered on demand, "○" as prerendered
    // static content. Both movement routes must be "ƒ".
    expect(stdout).toContain('ƒ /movements');
    expect(stdout).toContain('ƒ /movements/[movementId]');
    expect(stdout).not.toMatch(/○\s+\/movements\b/);

    const appPathRoutes = readJson<AppPathRoutesManifest>(
      '.next/app-path-routes-manifest.json',
    );
    const registeredAppPaths = Object.values(appPathRoutes);
    expect(registeredAppPaths).toContain('/movements');
    expect(registeredAppPaths).toContain('/movements/[movementId]');

    const prerenderManifest = readJson<PrerenderManifest>(
      '.next/prerender-manifest.json',
    );
    const staticallyGeneratedPaths = [
      ...Object.keys(prerenderManifest.routes),
      ...Object.keys(prerenderManifest.dynamicRoutes),
    ];
    expect(staticallyGeneratedPaths).not.toContain('/movements');
    expect(staticallyGeneratedPaths).not.toContain('/movements/[movementId]');

    // A statically generated route emits a prerendered `<route>.html` /
    // `.rsc` / `.meta` payload beside its route handler. A fully dynamic
    // route emits only the handler itself, never a movement payload.
    for (const artifact of [
      '.next/server/app/movements.html',
      '.next/server/app/movements.rsc',
      '.next/server/app/movements.meta',
    ]) {
      expect(existsSync(join(webRoot, artifact))).toBe(false);
    }
  }, 60_000);
});
