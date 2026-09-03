import {
  createPostgresConnection,
  createPostgresOnboardingReadinessProbe,
  type PostgresConnection,
} from '@fitness-os/database';
import {
  CryptoOnboardingIdFactory,
  CryptoOnboardingSecretFactory,
  HmacInvitationSecretVerifier,
  SystemTrustedClock,
} from '@fitness-os/domain';

import type { PlatformOptions } from '../app.js';
import { createOnboardingPgPersistence } from './pg-persistence.js';
import { createOnboardingStore } from './store.js';

export interface OnboardingPlatformHandles {
  platform: Pick<PlatformOptions, 'onboarding'>;
  connection: PostgresConnection;
}

/**
 * Composes onboarding's real PostgreSQL-backed persistence and readiness
 * evidence from environment configuration, mirroring
 * `createCatalogPlatformFromEnv` (`../catalog-platform.ts`): returns `null`
 * when the required database URL is absent instead of throwing, and no
 * caller currently wires this into `bootstrap.ts` — exactly like
 * `createCatalogPlatformFromEnv`, which is also unwired there today.
 *
 * The `clock`/`idFactory`/`secretFactory`/`secretVerifier` instances built
 * here are the same instances passed both to `registerOnboardingRoutes` (for
 * real onboarding operations) and into `createPostgresOnboardingReadinessProbe`'s
 * `mechanismComponents` (for their self-test), so the composed readiness
 * probe reports real evidence for the same mechanism a caller who uses this
 * platform would actually run — closing the gap PR #248 left open: "no
 * production call site currently constructs `createPostgresOnboardingReadinessProbe`
 * with real components at all."
 *
 * `secretVerifier` is keyed by a fresh in-process pepper from
 * `createOnboardingStore()`, the exact same default `registerOnboardingRoutes`
 * already falls back to when no `store`/`secretVerifier` is supplied. This
 * does not change or persist that pepper across restarts — that limitation
 * is pre-existing and out of scope here.
 *
 * `identity_adapter` and `policy_gateway` are intentionally left unset so
 * `registerOnboardingRoutes` keeps its synthetic defaults for them: those
 * legitimately wait on a separate identity/governance provider decision, not
 * something this composition can or should resolve.
 */
export function createOnboardingPlatformFromEnv(
  env: NodeJS.ProcessEnv,
): OnboardingPlatformHandles | null {
  const databaseUrl = env.ONBOARDING_DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  const connection = createPostgresConnection(databaseUrl);
  const store = createOnboardingStore();
  const clock = new SystemTrustedClock();
  const idFactory = new CryptoOnboardingIdFactory();
  const secretFactory = new CryptoOnboardingSecretFactory();
  const secretVerifier = new HmacInvitationSecretVerifier(store.pepper);
  const persistence = createOnboardingPgPersistence(connection, { clock });
  const readinessProbe = createPostgresOnboardingReadinessProbe(connection, {
    mechanismComponents: { clock, idFactory, secretFactory, secretVerifier },
  });

  return {
    connection,
    platform: {
      onboarding: {
        clock,
        idFactory,
        persistence,
        readinessProbe,
        secretFactory,
        secretVerifier,
        store,
      },
    },
  };
}
