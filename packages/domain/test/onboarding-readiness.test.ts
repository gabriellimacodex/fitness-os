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
});
