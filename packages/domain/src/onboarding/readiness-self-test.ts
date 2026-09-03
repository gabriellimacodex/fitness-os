import { randomBytes } from 'node:crypto';

import { invitationClaimSecretSchema } from '@fitness-os/schemas';

import type {
  OnboardingIdFactory,
  OnboardingSecretFactory,
} from './factories.js';
import type { TrustedClock } from './ports.js';
import {
  SyntheticOnboardingReadinessProbe,
  type OnboardingReadinessComponent,
  type OnboardingReadinessComponentId,
  type OnboardingReadinessProbe,
  type OnboardingReadinessResult,
} from './readiness.js';
import type { InvitationSecretVerifier } from './secret-verifier.js';

/**
 * The already-composed mechanism instances a self-test probe exercises. These
 * are the same instances a real onboarding composition uses for production
 * traffic, not disposable synthetic fakes.
 */
export type OnboardingMechanismSelfTestComponents = {
  clock: TrustedClock;
  idFactory: OnboardingIdFactory;
  secretFactory: OnboardingSecretFactory;
  secretVerifier: InvitationSecretVerifier;
};

const SELF_TESTED_COMPONENT_IDS = [
  'clock',
  'id_factory',
  'secret_factory',
  'secret_verifier',
] as const satisfies readonly OnboardingReadinessComponentId[];

function selfTestClock(clock: TrustedClock): boolean {
  const first = Date.parse(clock.nowUtcMs());
  const second = Date.parse(clock.nowUtcMs());
  return Number.isFinite(first) && Number.isFinite(second) && second >= first;
}

function selfTestIdFactory(idFactory: OnboardingIdFactory): boolean {
  const attemptIds = [idFactory.attemptId(), idFactory.attemptId()];
  const invitationIds = [idFactory.invitationId(), idFactory.invitationId()];
  const operationIds = [idFactory.operationId(), idFactory.operationId()];
  return (
    attemptIds[0] !== attemptIds[1] &&
    invitationIds[0] !== invitationIds[1] &&
    operationIds[0] !== operationIds[1]
  );
}

function selfTestSecretFactory(
  secretFactory: OnboardingSecretFactory,
): boolean {
  const first = secretFactory.claimSecret();
  const second = secretFactory.claimSecret();
  return (
    invitationClaimSecretSchema.safeParse(first).success &&
    invitationClaimSecretSchema.safeParse(second).success &&
    first !== second
  );
}

function selfTestSecretVerifier(
  secretVerifier: InvitationSecretVerifier,
): boolean {
  const probeSecret = randomBytes(24).toString('base64url');
  const digest = secretVerifier.digest(probeSecret);
  const matched = secretVerifier.verify(probeSecret, digest);
  const tampered = secretVerifier.verify(`${probeSecret}x`, digest);
  return matched.status === 'matched' && tampered.status === 'mismatch';
}

function evaluateSelfTestComponent(
  componentId: OnboardingReadinessComponentId,
  run: () => boolean,
): OnboardingReadinessComponent {
  try {
    return run()
      ? { componentId, diagnosticCode: null, state: 'ready' }
      : {
          componentId,
          diagnosticCode: 'configuration_mismatch',
          state: 'not_ready',
        };
  } catch {
    return {
      componentId,
      diagnosticCode: 'configuration_mismatch',
      state: 'not_ready',
    };
  }
}

/**
 * Wraps a base `OnboardingReadinessProbe` (defaults to the domain synthetic
 * probe) and replaces its `clock`, `id_factory`, `secret_factory`, and
 * `secret_verifier` components with a real functional self-test of the
 * supplied mechanism instances, per PRD 07's "Readiness" section
 * ("functioning trusted clock, random-ID source, invitation-secret
 * generator, verifier version").
 *
 * Each self-test exercises the real instance directly: the clock is checked
 * for a parseable, non-decreasing timestamp across two calls; the ID factory
 * for two distinct schema-valid IDs per kind (the factories already reject a
 * malformed ID by throwing during generation); the secret factory for two
 * distinct schema-valid claim secrets; and the secret verifier for a
 * matching round trip plus a rejected tampered digest. None of this persists
 * or logs the generated material — it is disposable probe input, discarded
 * immediately after the check.
 *
 * Every remaining component (schema, repositories, identity/policy adapters)
 * is left exactly as the base probe reports it. `mechanismReady` is
 * recomputed as the conjunction of all components so a failed self-test
 * flips it `false`; `productionReady` stays `false`, unaffected by
 * `LEGAL_PRIVACY_DECISION_REQUIRED`.
 */
export function createSelfTestOnboardingReadinessProbe(
  components: OnboardingMechanismSelfTestComponents,
  options: {
    baseProbe?: OnboardingReadinessProbe;
    evaluatedAt?: string;
  } = {},
): OnboardingReadinessProbe {
  const baseProbe =
    options.baseProbe ??
    new SyntheticOnboardingReadinessProbe({
      evaluatedAt: options.evaluatedAt ?? new Date().toISOString(),
    });
  const overriddenIds = new Set<OnboardingReadinessComponentId>(
    SELF_TESTED_COMPONENT_IDS,
  );

  return {
    async evaluate(): Promise<OnboardingReadinessResult> {
      const base = await baseProbe.evaluate();

      const selfTested: Record<
        (typeof SELF_TESTED_COMPONENT_IDS)[number],
        OnboardingReadinessComponent
      > = {
        clock: evaluateSelfTestComponent('clock', () =>
          selfTestClock(components.clock),
        ),
        id_factory: evaluateSelfTestComponent('id_factory', () =>
          selfTestIdFactory(components.idFactory),
        ),
        secret_factory: evaluateSelfTestComponent('secret_factory', () =>
          selfTestSecretFactory(components.secretFactory),
        ),
        secret_verifier: evaluateSelfTestComponent('secret_verifier', () =>
          selfTestSecretVerifier(components.secretVerifier),
        ),
      };

      // Replace in place so component order matches the base probe exactly;
      // this never adds, drops, or reorders a component id.
      const resultComponents = base.components.map((component) =>
        overriddenIds.has(component.componentId)
          ? selfTested[
              component.componentId as (typeof SELF_TESTED_COMPONENT_IDS)[number]
            ]
          : component,
      );
      const mechanismReady = resultComponents.every(
        (component) => component.state === 'ready',
      );

      const staleDiagnostics = new Set(
        base.components
          .filter((component) => overriddenIds.has(component.componentId))
          .flatMap((component) =>
            component.diagnosticCode === null ? [] : [component.diagnosticCode],
          ),
      );
      const newDiagnostics = Object.values(selfTested).flatMap((component) =>
        component.diagnosticCode === null ? [] : [component.diagnosticCode],
      );
      const diagnosticCodes = [
        ...new Set([
          ...base.diagnosticCodes.filter(
            (diagnostic) => !staleDiagnostics.has(diagnostic),
          ),
          ...newDiagnostics,
        ]),
      ];

      return {
        components: resultComponents,
        diagnosticCodes,
        evaluatedAt: base.evaluatedAt,
        mechanismReady,
        productionReady: false,
      };
    },
  };
}
