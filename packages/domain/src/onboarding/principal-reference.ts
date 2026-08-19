export type PrincipalReferenceCandidate = {
  derivationVersion: string;
  principalReferenceDigest: string;
};

export type PrincipalReferenceDeriveResult =
  | {
      status: 'derived';
      candidates: readonly PrincipalReferenceCandidate[];
    }
  | {
      status: 'denied';
      reason:
        'synthetic_in_production' | 'missing_subject' | 'unapproved_issuer';
    };

/**
 * Produce the complete approved-version candidate set from verified
 * issuer/subject/environment using protected key material.
 */
export interface PrincipalReferenceDeriver {
  derive(input: {
    issuer: string;
    subjectDigest: string;
    environment: string;
    productionMode: boolean;
  }): Promise<PrincipalReferenceDeriveResult>;
}

/**
 * Synthetic deriver for disposable compositions. Emits a single deterministic
 * candidate digest without provider tokens.
 */
export class SyntheticPrincipalReferenceDeriver implements PrincipalReferenceDeriver {
  async derive(input: {
    issuer: string;
    subjectDigest: string;
    environment: string;
    productionMode: boolean;
  }): Promise<PrincipalReferenceDeriveResult> {
    if (input.productionMode) {
      return { reason: 'synthetic_in_production', status: 'denied' };
    }
    if (input.subjectDigest.trim() === '') {
      return { reason: 'missing_subject', status: 'denied' };
    }
    if (input.issuer.trim() === '') {
      return { reason: 'unapproved_issuer', status: 'denied' };
    }

    const principalReferenceDigest = [
      'synthetic',
      input.issuer,
      input.environment,
      input.subjectDigest,
    ].join(':');

    return {
      candidates: [
        {
          derivationVersion: 'synthetic.v1',
          principalReferenceDigest,
        },
      ],
      status: 'derived',
    };
  }
}
