import { describe, expect, it } from 'vitest';

import { createPrivacyPlatformFromEnv } from './platform.js';

describe('privacy platform env composition', () => {
  it('returns null when PRIVACY_DATABASE_URL is not configured', () => {
    expect(createPrivacyPlatformFromEnv({})).toBeNull();
  });

  it('composes real ports, retention rules, a governance-lifecycle verifier, and a readiness probe without connecting', () => {
    const handles = createPrivacyPlatformFromEnv({
      PRIVACY_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5999/never',
    });

    expect(handles).not.toBeNull();
    const privacy = handles?.platform.privacy;
    expect(privacy).toBeDefined();
    expect(privacy?.audit).toBeDefined();
    expect(privacy?.evidence).toBeDefined();
    expect(privacy?.subjectRequests).toBeDefined();
    expect(privacy?.policies).toBeDefined();
    expect(privacy?.purposes).toBeDefined();
    expect(privacy?.processors).toBeDefined();
    expect(privacy?.processorSteps).toBeDefined();
    expect(privacy?.processorExecutionJournal).toBeDefined();
    expect(privacy?.governanceLifecycle).toBeDefined();
    expect(privacy?.retentionPreviews).toBeDefined();
    expect(typeof privacy?.governanceLifecycleVerifier?.verify).toBe(
      'function',
    );
    expect(typeof privacy?.readiness?.evaluate).toBe('function');
    // Reaching this assertion already proves the reviewed inventory fixture
    // loaded and validated: SyntheticPrivacyExpectedProcessorInventory's
    // constructor parses it synchronously during composition, above, and
    // would have thrown before this point if the fixture were missing or
    // schema-invalid. `.evaluate()` itself is intentionally not called here —
    // with a real connection and the real PG runtime-processor registry now
    // wired in, it performs a live query and cannot be safely exercised
    // against this fake, unreachable database, matching this file's existing
    // no-live-connection pattern for the other readiness components.

    // Does not decide the route-gating flag or any option this helper does
    // not itself set — that stays the caller's decision.
    expect(
      (handles?.platform as { allowSyntheticPrivacy?: unknown })
        .allowSyntheticPrivacy,
    ).toBeUndefined();
    expect(privacy?.retentionRules).toBeDefined();
  });

  it('produces independent connections and ledger instances across separate compositions', () => {
    const first = createPrivacyPlatformFromEnv({
      PRIVACY_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5999/never',
    });
    const second = createPrivacyPlatformFromEnv({
      PRIVACY_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5999/never',
    });

    expect(first?.connection).not.toBe(second?.connection);
    expect(first?.platform.privacy?.governanceLifecycle).not.toBe(
      second?.platform.privacy?.governanceLifecycle,
    );
  });
});
