import type { ProposedRole } from './claim.js';

export type OnboardingTrustedContext = {
  mappedRoles: readonly ProposedRole[];
  principalKey: string;
  synthetic: boolean;
};

export type IdentitySessionResolution =
  | { status: 'resolved'; context: OnboardingTrustedContext }
  | {
      status: 'denied';
      reason:
        | 'missing'
        | 'invalid'
        | 'expired'
        | 'synthetic_in_production'
        | 'unapproved_issuer';
    };

/**
 * Convert a verified backend session into trusted provider-neutral context
 * or a closed denial; never expose provider claims.
 */
export interface IdentitySessionPort {
  resolve(input: {
    productionMode: boolean;
    /**
     * Opaque trusted binder already verified by the adapter boundary.
     * Implementations must not parse provider tokens here.
     */
    trustedPrincipalKey: string | null;
    mappedRoles?: readonly ProposedRole[];
    synthetic?: boolean;
  }): Promise<IdentitySessionResolution>;
}

/**
 * Synthetic identity session port for disposable compositions.
 */
export class SyntheticIdentitySessionPort implements IdentitySessionPort {
  async resolve(input: {
    productionMode: boolean;
    trustedPrincipalKey: string | null;
    mappedRoles?: readonly ProposedRole[];
    synthetic?: boolean;
  }): Promise<IdentitySessionResolution> {
    if (input.productionMode) {
      // This adapter is synthetic-only; production must use a reviewed adapter.
      return { reason: 'synthetic_in_production', status: 'denied' };
    }
    if (input.trustedPrincipalKey === null) {
      return { reason: 'missing', status: 'denied' };
    }
    const synthetic = input.synthetic ?? true;
    return {
      context: {
        mappedRoles: input.mappedRoles ?? [],
        principalKey: input.trustedPrincipalKey,
        synthetic,
      },
      status: 'resolved',
    };
  }
}
