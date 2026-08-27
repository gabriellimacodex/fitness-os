import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingReadinessProbe } from '../src/onboarding/readiness.js';

describe('SyntheticOnboardingReadinessProbe', () => {
  it('reports mechanism ready while production stays blocked by LEGAL_PRIVACY', async () => {
    const probe = new SyntheticOnboardingReadinessProbe({
      evaluatedAt: '2026-08-19T12:00:00.000Z',
    });
    const result = await probe.evaluate();
    expect(result.mechanismReady).toBe(true);
    expect(result.productionReady).toBe(false);
    expect(result.diagnosticCodes).toContain('legal_privacy_decision_required');
    expect(result.components.every((c) => c.state === 'ready')).toBe(true);
  });

  it('can report mechanism not ready when schema is unavailable', async () => {
    const probe = new SyntheticOnboardingReadinessProbe({
      evaluatedAt: '2026-08-19T12:00:00.000Z',
      mechanismComponentsReady: false,
    });
    const result = await probe.evaluate();
    expect(result.mechanismReady).toBe(false);
    expect(result.productionReady).toBe(false);
    expect(result.components[0]).toMatchObject({
      componentId: 'schema',
      state: 'not_ready',
      diagnosticCode: 'schema_mismatch',
    });
  });

  it('emits the trusted clock, ID factory, and secret factory components required by PRD 07 mechanism readiness', async () => {
    const probe = new SyntheticOnboardingReadinessProbe({
      evaluatedAt: '2026-08-19T12:00:00.000Z',
    });
    const result = await probe.evaluate();
    const componentIds = result.components.map((c) => c.componentId);

    expect(componentIds).toEqual([
      'schema',
      'clock',
      'id_factory',
      'secret_factory',
      'invitation_repository',
      'attempt_repository',
      'operation_repository',
      'role_mapping_repository',
      'secret_verifier',
      'identity_adapter',
      'policy_gateway',
    ]);
    expect(new Set(componentIds).size).toBe(componentIds.length);
    for (const componentId of ['clock', 'id_factory', 'secret_factory']) {
      expect(
        result.components.find((c) => c.componentId === componentId),
      ).toMatchObject({ state: 'ready', diagnosticCode: null });
    }
  });
});
