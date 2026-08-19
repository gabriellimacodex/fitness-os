export type OnboardingReadinessDiagnostic =
  | 'migration_missing'
  | 'schema_mismatch'
  | 'identity_adapter_missing'
  | 'identity_adapter_synthetic'
  | 'policy_gateway_missing'
  | 'policy_gateway_synthetic'
  | 'policy_gateway_blocked'
  | 'credential_unavailable'
  | 'operation_reconciliation_incomplete'
  | 'dual_role_self_coach_bypass'
  | 'recovery_unverified'
  | 'configuration_mismatch'
  | 'legal_privacy_decision_required'
  | 'human_perception_required';

export type OnboardingReadinessComponentId =
  | 'schema'
  | 'clock'
  | 'id_factory'
  | 'secret_factory'
  | 'invitation_repository'
  | 'attempt_repository'
  | 'operation_repository'
  | 'role_mapping_repository'
  | 'secret_verifier'
  | 'identity_adapter'
  | 'policy_gateway';

export type OnboardingReadinessComponent = {
  componentId: OnboardingReadinessComponentId;
  state: 'ready' | 'not_ready';
  diagnosticCode: OnboardingReadinessDiagnostic | null;
};

export type OnboardingReadinessResult = {
  evaluatedAt: string;
  mechanismReady: boolean;
  productionReady: boolean;
  components: readonly OnboardingReadinessComponent[];
  diagnosticCodes: readonly OnboardingReadinessDiagnostic[];
};

/**
 * Return safe mechanism and production component evidence without secrets.
 */
export interface OnboardingReadinessProbe {
  evaluate(): Promise<OnboardingReadinessResult>;
}

/**
 * Synthetic disposable composition: mechanism may be ready while production
 * stays false under LEGAL_PRIVACY_DECISION_REQUIRED.
 */
export class SyntheticOnboardingReadinessProbe implements OnboardingReadinessProbe {
  constructor(
    private readonly options: {
      evaluatedAt: string;
      mechanismComponentsReady?: boolean;
    },
  ) {}

  async evaluate(): Promise<OnboardingReadinessResult> {
    const mechanismReady = this.options.mechanismComponentsReady ?? true;
    const components: OnboardingReadinessComponent[] = [
      {
        componentId: 'schema',
        diagnosticCode: mechanismReady ? null : 'schema_mismatch',
        state: mechanismReady ? 'ready' : 'not_ready',
      },
      {
        componentId: 'invitation_repository',
        diagnosticCode: null,
        state: 'ready',
      },
      {
        componentId: 'attempt_repository',
        diagnosticCode: null,
        state: 'ready',
      },
      {
        componentId: 'operation_repository',
        diagnosticCode: null,
        state: 'ready',
      },
      {
        componentId: 'role_mapping_repository',
        diagnosticCode: null,
        state: 'ready',
      },
      {
        componentId: 'secret_verifier',
        diagnosticCode: null,
        state: 'ready',
      },
      {
        componentId: 'identity_adapter',
        diagnosticCode: 'identity_adapter_synthetic',
        state: 'ready',
      },
      {
        componentId: 'policy_gateway',
        diagnosticCode: 'policy_gateway_synthetic',
        state: 'ready',
      },
    ];

    return {
      components,
      diagnosticCodes: ['legal_privacy_decision_required'],
      evaluatedAt: this.options.evaluatedAt,
      mechanismReady,
      productionReady: false,
    };
  }
}
