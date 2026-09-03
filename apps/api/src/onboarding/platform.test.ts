import { afterEach, describe, expect, it } from 'vitest';

import { createOnboardingPlatformFromEnv } from './platform.js';

describe('onboarding platform env composition', () => {
  let handles: ReturnType<typeof createOnboardingPlatformFromEnv> = null;

  afterEach(async () => {
    await handles?.connection.close();
    handles = null;
  });

  it('returns null when ONBOARDING_DATABASE_URL is not configured', () => {
    expect(createOnboardingPlatformFromEnv({})).toBeNull();
  });

  it('composes real persistence and a PG-backed readiness probe from a configured database URL', () => {
    handles = createOnboardingPlatformFromEnv({
      ONBOARDING_DATABASE_URL:
        'postgresql://user:pass@127.0.0.1:1/doesnotexist',
    });

    expect(handles).not.toBeNull();
    const onboarding = handles?.platform.onboarding;
    expect(onboarding?.persistence).toBeDefined();
    expect(onboarding?.readinessProbe).toBeDefined();
    expect(typeof onboarding?.readinessProbe?.evaluate).toBe('function');
    expect(onboarding?.clock).toBeDefined();
    expect(onboarding?.idFactory).toBeDefined();
    expect(onboarding?.secretFactory).toBeDefined();
    expect(onboarding?.secretVerifier).toBeDefined();
    expect(onboarding?.store).toBeDefined();
    // Not composed here: those legitimately remain synthetic pending a
    // separate identity/governance provider decision.
    expect(onboarding?.identitySession).toBeUndefined();
    expect(onboarding?.policyGateway).toBeUndefined();
  });

  it('generates a distinct secret-verifier pepper per composition, matching the default registerOnboardingRoutes behavior', async () => {
    const first = createOnboardingPlatformFromEnv({
      ONBOARDING_DATABASE_URL:
        'postgresql://user:pass@127.0.0.1:1/doesnotexist',
    });
    const second = createOnboardingPlatformFromEnv({
      ONBOARDING_DATABASE_URL:
        'postgresql://user:pass@127.0.0.1:1/doesnotexist',
    });

    try {
      expect(first?.platform.onboarding?.store?.pepper).not.toEqual(
        second?.platform.onboarding?.store?.pepper,
      );
    } finally {
      await Promise.all([
        first?.connection.close(),
        second?.connection.close(),
      ]);
    }
  });
});
