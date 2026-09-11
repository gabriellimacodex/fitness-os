import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPostgresConnection,
  createPostgresPrivacyGovernanceLifecycleBindingVerifier,
  createPostgresPrivacyReadinessProbe,
  type PostgresConnection,
} from '@fitness-os/database';
import {
  SyntheticPrivacyExpectedProcessorInventory,
  type PrivacyExpectedProcessorInventoryPort,
} from '@fitness-os/domain';
import { privacyExpectedProcessorInventorySchema } from '@fitness-os/schemas';

import type { PlatformOptions } from '../app.js';
import { createPrivacyPgPersistence } from './pg-persistence.js';

const reviewedInventoryFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/schemas/fixtures/privacy/processor-inventory.v1.json',
);

/**
 * Loads the version-controlled, independently reviewed processor inventory
 * (`docs/technical-design/021-privacy-data-governance.md`'s "Inventory
 * artifact") packaged alongside this candidate build, and wraps it as the
 * `PrivacyExpectedProcessorInventoryPort` that readiness's inventory-coverage
 * comparison, and the privacy routes' inventory-coverage endpoint, compare
 * the runtime registry against. The reviewed fixture is metadata only — no
 * connection value, secret, or subject data — so reading it at
 * platform-composition time is not itself a `LEGAL_PRIVACY_DECISION_REQUIRED`
 * concern; a fixture that fails to parse or validate throws rather than
 * silently falling back, since a corrupted reviewed artifact must fail
 * closed, not compose a platform with unreviewed inventory.
 */
export function loadReviewedPrivacyExpectedProcessorInventory(): PrivacyExpectedProcessorInventoryPort {
  const raw = JSON.parse(readFileSync(reviewedInventoryFixturePath, 'utf8'));
  const inventory = privacyExpectedProcessorInventorySchema.parse(raw);
  return new SyntheticPrivacyExpectedProcessorInventory(inventory);
}

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
 * `expectedInventory` is the reviewed fixture loaded by
 * `loadReviewedPrivacyExpectedProcessorInventory`; `readiness`'s
 * `runtimeProcessors` is this same connection's `persistence.processors`, so
 * inventory-coverage compares the reviewed inventory against this exact
 * database's processor-registration rows, not a disconnected or synthetic
 * substitute. No row seeds itself: until a processor is actually registered
 * through `persistence.processors.put`, coverage correctly reports
 * `not_ready` for the declared processor rather than silently passing.
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
): PrivacyPlatformHandles | null {
  const databaseUrl = env.PRIVACY_DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const connection = createPostgresConnection(databaseUrl);
  const persistence = createPrivacyPgPersistence(connection);
  const governanceLifecycleVerifier =
    createPostgresPrivacyGovernanceLifecycleBindingVerifier(connection);
  const expectedInventory = loadReviewedPrivacyExpectedProcessorInventory();
  const readiness = createPostgresPrivacyReadinessProbe(connection, {
    expectedInventory,
    runtimeProcessors: persistence.processors,
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
        expectedInventory,
        readiness,
      },
    },
  };
}
