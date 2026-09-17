import { describe, expect, it, vi } from 'vitest';

const runtimeProcessors = {
  getDescriptor: async () => null,
  listDescriptors: async () => [],
  put: async () => 'accepted' as const,
};

vi.mock('@fitness-os/database', () => ({
  createPostgresConnection: vi.fn(() => ({
    db: {},
    close: async () => undefined,
  })),
  createPostgresPrivacyAuditSink: vi.fn(() => ({})),
  createPostgresPrivacyAuthorizationEvidenceLedger: vi.fn(() => ({})),
  createPostgresPrivacySubjectRequestRepository: vi.fn(() => ({})),
  createPostgresPrivacyPolicyPackageRepository: vi.fn(() => ({})),
  createPostgresPrivacyPurposeRegistry: vi.fn(() => ({})),
  createPostgresPrivacyRuntimeProcessorRegistry: vi.fn(() => runtimeProcessors),
  createPostgresPrivacyProcessorStepRepository: vi.fn(() => ({})),
  createPostgresPrivacyProcessorExecutionJournal: vi.fn(() => ({})),
  createPostgresPrivacyGovernanceLifecycleLedger: vi.fn(() => ({})),
  createPostgresPrivacyRetentionPreviewRepository: vi.fn(() => ({})),
  createPostgresPrivacyRetentionRuleRepository: vi.fn(() => ({})),
  createPostgresPrivacyGovernanceLifecycleBindingVerifier: vi.fn(() => ({
    verify: async () => null,
  })),
  createPostgresPrivacyReadinessProbe: vi.fn(() => ({
    evaluate: async () => {
      throw new Error('not exercised by this test');
    },
  })),
}));

import { createPostgresPrivacyReadinessProbe } from '@fitness-os/database';

import { createPrivacyPlatformFromEnv } from './platform.js';

describe('createPrivacyPlatformFromEnv readiness-probe wiring', () => {
  it('constructs the readiness probe with the same expectedInventory/runtimeProcessors the platform exposes to routes', () => {
    const handles = createPrivacyPlatformFromEnv({
      PRIVACY_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5999/never',
    });

    expect(createPostgresPrivacyReadinessProbe).toHaveBeenCalledTimes(1);
    const readinessOptions = vi.mocked(createPostgresPrivacyReadinessProbe).mock
      .calls[0]?.[1];

    // Fails if a future change drops these options from the
    // createPostgresPrivacyReadinessProbe call while leaving the platform's
    // own `privacy.expectedInventory`/`privacy.processors` fields untouched —
    // exactly the regression a field-presence-only assertion cannot catch.
    expect(readinessOptions?.runtimeProcessors).toBe(runtimeProcessors);
    expect(readinessOptions?.runtimeProcessors).toBe(
      handles?.platform.privacy?.processors,
    );
    expect(readinessOptions?.expectedInventory).toBeDefined();
    expect(readinessOptions?.expectedInventory).toBe(
      handles?.platform.privacy?.expectedInventory,
    );
  });
});
