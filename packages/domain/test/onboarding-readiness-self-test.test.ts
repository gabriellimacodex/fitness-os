import { describe, expect, it } from 'vitest';

import {
  CryptoOnboardingIdFactory,
  CryptoOnboardingSecretFactory,
} from '../src/onboarding/factories.js';
import {
  FixedTrustedClock,
  SystemTrustedClock,
} from '../src/onboarding/ports.js';
import { createSelfTestOnboardingReadinessProbe } from '../src/onboarding/readiness-self-test.js';
import { SyntheticOnboardingReadinessProbe } from '../src/onboarding/readiness.js';
import { HmacInvitationSecretVerifier } from '../src/onboarding/secret-verifier.js';

function realComponents() {
  return {
    clock: new SystemTrustedClock(),
    idFactory: new CryptoOnboardingIdFactory(),
    secretFactory: new CryptoOnboardingSecretFactory(),
    secretVerifier: new HmacInvitationSecretVerifier(
      Buffer.from('self-test-pepper-not-a-real-secret'),
    ),
  };
}

describe('createSelfTestOnboardingReadinessProbe', () => {
  it('reports the self-tested components ready when backed by real mechanism instances', async () => {
    const probe = createSelfTestOnboardingReadinessProbe(realComponents(), {
      evaluatedAt: '2026-08-19T12:00:00.000Z',
    });
    const result = await probe.evaluate();

    for (const componentId of [
      'clock',
      'id_factory',
      'secret_factory',
      'secret_verifier',
    ] as const) {
      expect(
        result.components.find((c) => c.componentId === componentId),
      ).toMatchObject({ diagnosticCode: null, state: 'ready' });
    }
    expect(result.mechanismReady).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.diagnosticCodes).toEqual(['legal_privacy_decision_required']);
  });

  it('preserves the exact component id set and order of the base probe', async () => {
    const base = new SyntheticOnboardingReadinessProbe({
      evaluatedAt: '2026-08-19T12:00:00.000Z',
    });
    const baseResult = await base.evaluate();
    const probe = createSelfTestOnboardingReadinessProbe(realComponents(), {
      baseProbe: base,
    });
    const result = await probe.evaluate();

    expect(result.components.map((c) => c.componentId)).toEqual(
      baseResult.components.map((c) => c.componentId),
    );
  });

  it('flips mechanismReady false and reports configuration_mismatch when the clock never advances', async () => {
    const probe = createSelfTestOnboardingReadinessProbe(
      {
        ...realComponents(),
        clock: new FixedTrustedClock('not-a-real-timestamp'),
      },
      { evaluatedAt: '2026-08-19T12:00:00.000Z' },
    );
    const result = await probe.evaluate();

    expect(result.components.find((c) => c.componentId === 'clock')).toEqual({
      componentId: 'clock',
      diagnosticCode: 'configuration_mismatch',
      state: 'not_ready',
    });
    expect(result.mechanismReady).toBe(false);
  });

  it('flips mechanismReady false when the ID factory is degenerate', async () => {
    const probe = createSelfTestOnboardingReadinessProbe(
      {
        ...realComponents(),
        idFactory: {
          attemptId: () => 'fixed' as never,
          invitationId: () => 'fixed' as never,
          operationId: () => 'fixed' as never,
        },
      },
      { evaluatedAt: '2026-08-19T12:00:00.000Z' },
    );
    const result = await probe.evaluate();

    expect(
      result.components.find((c) => c.componentId === 'id_factory'),
    ).toMatchObject({
      diagnosticCode: 'configuration_mismatch',
      state: 'not_ready',
    });
    expect(result.mechanismReady).toBe(false);
  });

  it('flips mechanismReady false when the secret factory repeats output', async () => {
    const probe = createSelfTestOnboardingReadinessProbe(
      {
        ...realComponents(),
        secretFactory: { claimSecret: () => 'same-value-every-time-000000' },
      },
      { evaluatedAt: '2026-08-19T12:00:00.000Z' },
    );
    const result = await probe.evaluate();

    expect(
      result.components.find((c) => c.componentId === 'secret_factory'),
    ).toMatchObject({
      diagnosticCode: 'configuration_mismatch',
      state: 'not_ready',
    });
    expect(result.mechanismReady).toBe(false);
  });

  it('flips mechanismReady false when the secret verifier accepts a tampered digest', async () => {
    const probe = createSelfTestOnboardingReadinessProbe(
      {
        ...realComponents(),
        secretVerifier: {
          digest: (secret: string) => `digest:${secret}`,
          verify: () => ({ status: 'matched' as const }),
        },
      },
      { evaluatedAt: '2026-08-19T12:00:00.000Z' },
    );
    const result = await probe.evaluate();

    expect(
      result.components.find((c) => c.componentId === 'secret_verifier'),
    ).toMatchObject({
      diagnosticCode: 'configuration_mismatch',
      state: 'not_ready',
    });
    expect(result.mechanismReady).toBe(false);
  });
});
