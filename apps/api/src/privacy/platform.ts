import {
  createPostgresConnection,
  createPostgresPrivacyGovernanceLifecycleBindingVerifier,
  createPostgresPrivacyReadinessProbe,
  type PostgresConnection,
} from '@fitness-os/database';

import type { PlatformOptions } from '../app.js';
import { createPrivacyPgPersistence } from './pg-persistence.js';

export interface PrivacyPlatformHandles {
  platform: Pick<PlatformOptions, 'privacy'>;
  connection: PostgresConnection;
}

/**
 * Composes a real PostgreSQL-backed privacy platform from environment
 * configuration, mirroring `createCatalogPlatformFromEnv`'s fail-closed,
 * env-gated shape: returns `null` when `PRIVACY_DATABASE_URL` is unset so a
 * caller can fall back to the in-memory synthetic defaults
 * `registerPrivacySyntheticRoutes` already applies for every option this
 * helper does not set.
 *
 * `governanceLifecycleVerifier` is composed from the exact same `connection`
 * as `governanceLifecycle`, so its post-persistence lookup targets the real
 * append-only ledger this platform writes to (not a disconnected duplicate) —
 * the same reasoning `createOnboardingPlatformFromEnv` applied when binding
 * its readiness probe's mechanism components to the same instances used for
 * real operations.
 *
 * This does not set `allowSyntheticPrivacy` — that gate, and whether to also
 * inject `retentionRules`, `ids`, `clock`, or any other still-synthetic-only
 * option, remains the caller's decision when building the app. Like
 * `createCatalogPlatformFromEnv`, this function is not wired into
 * `bootstrap.ts` or any production server-startup path; no call site
 * currently constructs it.
 */
export function createPrivacyPlatformFromEnv(
  env: NodeJS.ProcessEnv,
): PrivacyPlatformHandles | null {
  const databaseUrl = env.PRIVACY_DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const connection = createPostgresConnection(databaseUrl);
  const persistence = createPrivacyPgPersistence(connection);
  const governanceLifecycleVerifier =
    createPostgresPrivacyGovernanceLifecycleBindingVerifier(connection);
  const readiness = createPostgresPrivacyReadinessProbe(connection);

  return {
    connection,
    platform: {
      privacy: {
        audit: persistence.audit,
        evidence: persistence.evidence,
        subjectRequests: persistence.subjectRequests,
        policies: persistence.policies,
        purposes: persistence.purposes,
        processors: persistence.processors,
        processorSteps: persistence.processorSteps,
        processorExecutionJournal: persistence.processorExecutionJournal,
        governanceLifecycle: persistence.governanceLifecycle,
        retentionPreviews: persistence.retentionPreviews,
        governanceLifecycleVerifier,
        readiness,
      },
    },
  };
}
