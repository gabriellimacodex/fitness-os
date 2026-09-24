import {
  createPostgresConnection,
  createPostgresPrivacyGovernanceLifecycleBindingVerifier,
  createPostgresPrivacyReadinessProbe,
  type PostgresConnection,
} from '@fitness-os/database';
import type { PrivacyExpectedProcessorInventoryPort } from '@fitness-os/domain';

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
 * real operations. `readiness` is bound the same way: its `runtimeProcessors`
 * comparison target is `persistence.processors`, the exact same real
 * PG-backed registry `platform.privacy.processors` exposes for actual
 * processor registration — not a disconnected duplicate — so a caller who
 * registers a processor through this platform sees that registration reflect
 * in the readiness evaluation of the same composition.
 *
 * `expectedInventory` has no real, reviewed content anywhere in this
 * codebase yet — only synthetic fixtures exist (`SyntheticPrivacyExpected-
 * ProcessorInventory`) — so this helper cannot supply one on its own without
 * inventing production-authoritative content, exactly like `identity_adapter`
 * and `policy_gateway` are left unset by `createOnboardingPlatformFromEnv`
 * pending a separate decision. `options.expectedInventory` exists so a future
 * caller who does have a reviewed inventory port can inject it; until then,
 * omitting it keeps `expected_inventory`/`runtime_processors` exactly at the
 * base probe's synthetic defaults (unchanged from before this parameter
 * existed), since `createPostgresPrivacyReadinessProbe` only overrides that
 * pair when both `expectedInventory` and `runtimeProcessors` are supplied
 * together.
 *
 * This does not set `allowSyntheticPrivacy` — that gate, and whether to also
 * inject `ids`, `clock`, or any other still-synthetic-only option, remains the
 * caller's decision when building the app. Like
 * `createCatalogPlatformFromEnv`, this function is not wired into
 * `bootstrap.ts` or any production server-startup path; no call site
 * currently constructs it.
 */
export function createPrivacyPlatformFromEnv(
  env: NodeJS.ProcessEnv,
  options: {
    expectedInventory?: PrivacyExpectedProcessorInventoryPort;
  } = {},
): PrivacyPlatformHandles | null {
  const databaseUrl = env.PRIVACY_DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const connection = createPostgresConnection(databaseUrl);
  const persistence = createPrivacyPgPersistence(connection);
  const governanceLifecycleVerifier =
    createPostgresPrivacyGovernanceLifecycleBindingVerifier(connection);
  const readiness = createPostgresPrivacyReadinessProbe(connection, {
    runtimeProcessors: persistence.processors,
    expectedInventory: options.expectedInventory,
  });

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
        retentionRules: persistence.retentionRules,
        governanceLifecycleVerifier,
        readiness,
      },
    },
  };
}
