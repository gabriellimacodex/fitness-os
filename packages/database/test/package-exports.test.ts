import { describe, expect, it } from 'vitest';

import * as databasePackage from '../src/index.js';

/**
 * `packages/database/package.json` exposes only the root `.` export, so
 * `@fitness-os/database` consumers can only ever reach what `src/index.ts`
 * re-exports — anything defined only inside an internal sub-barrel (e.g.
 * `src/onboarding/index.ts`) is unreachable outside this package. This test
 * pins the onboarding claim-failure tracker's symbols to that root barrel so
 * a future edit cannot silently drop them again, the way `src/index.ts`
 * previously omitted `createPostgresClaimFailureTracker`, `asClaimFailureTracker`,
 * and the `onboardingClaimFailure` table despite `createOnboardingPgPersistence`-style
 * callers in `apps/api` having no other supported way to import them.
 */
describe('@fitness-os/database package root exports', () => {
  it('exposes the onboarding claim-failure tracker factory and adapter', () => {
    expect(typeof databasePackage.createPostgresClaimFailureTracker).toBe(
      'function',
    );
    expect(typeof databasePackage.asClaimFailureTracker).toBe('function');
  });

  it('exposes the onboarding claim-failure Drizzle table', () => {
    expect(databasePackage.onboardingClaimFailure).toBeDefined();
  });
});
