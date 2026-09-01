import {
  privacyReadinessResultSchema,
  type PrivacyReadinessComponent,
  type PrivacyReadinessResult,
} from '@fitness-os/schemas';

/**
 * Return safe mechanism and production readiness evidence without secrets.
 */
export interface PrivacyReadinessProbe {
  evaluate(): Promise<PrivacyReadinessResult>;
}

/**
 * Disposable synthetic composition: every component reports the fail-closed
 * baseline the synthetic privacy route has always returned (mirrors
 * `SyntheticOnboardingReadinessProbe`). Mechanism is never ready by default;
 * production stays false while `legal_privacy_decision_required` is active.
 */
export class SyntheticPrivacyReadinessProbe implements PrivacyReadinessProbe {
  constructor(private readonly options: { evaluatedAt: string }) {}

  async evaluate(): Promise<PrivacyReadinessResult> {
    const components: PrivacyReadinessComponent[] = [
      { componentId: 'contracts', state: 'ready', diagnosticCode: null },
      {
        componentId: 'migrations',
        state: 'not_ready',
        diagnosticCode: 'migration_missing',
      },
      {
        componentId: 'repositories',
        state: 'unavailable',
        diagnosticCode: 'repository_unavailable',
      },
      {
        componentId: 'audit_sink',
        state: 'unavailable',
        diagnosticCode: 'audit_unavailable',
      },
      {
        componentId: 'expected_inventory',
        state: 'not_ready',
        diagnosticCode: 'inventory_mismatch',
      },
      {
        componentId: 'runtime_processors',
        state: 'not_ready',
        diagnosticCode: 'processor_missing',
      },
      {
        componentId: 'governance_lifecycle',
        state: 'not_ready',
        diagnosticCode: 'governance_table_lifecycle_missing',
      },
      {
        componentId: 'identity_boundary',
        state: 'not_ready',
        diagnosticCode: 'identity_boundary_missing',
      },
      {
        componentId: 'policy_package',
        state: 'not_ready',
        diagnosticCode: 'policy_missing',
      },
      {
        componentId: 'recovery',
        state: 'not_ready',
        diagnosticCode: 'recovery_unverified',
      },
    ];

    return privacyReadinessResultSchema.parse({
      mechanismReady: false,
      productionReady: false,
      canonicalizationVersion: 'privacy-governance.canonical.v1',
      schemaDigest: 'a'.repeat(64),
      inventoryVersionDigest: 'b'.repeat(64),
      components,
      diagnosticCodes: [
        'audit_unavailable',
        'governance_table_lifecycle_missing',
        'identity_boundary_missing',
        'inventory_mismatch',
        'legal_privacy_decision_required',
        'migration_missing',
        'policy_missing',
        'processor_missing',
        'recovery_unverified',
        'repository_unavailable',
      ],
      evaluatedAt: this.options.evaluatedAt,
    });
  }
}
