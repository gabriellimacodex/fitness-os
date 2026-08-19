import { createHash, randomUUID } from 'node:crypto';

import {
  onboardingPolicyEvidenceIdSchema,
  onboardingPolicyInteractionIdSchema,
  onboardingPolicyPackageIdSchema,
  policyHandoffSchema,
} from '@fitness-os/schemas';
import type { z } from 'zod';

type PolicyHandoff = z.infer<typeof policyHandoffSchema>;

export type OnboardingPolicyGatewayStartResult =
  | { status: 'started'; handoff: PolicyHandoff }
  | {
      status: 'blocked';
      reason: 'synthetic_in_production' | 'gateway_unavailable';
    };

/**
 * Start/resume/poll/validate reference-only governance interactions.
 * Never returns legal text or package body.
 */
export interface OnboardingPolicyGateway {
  refresh(input: {
    attemptId: string;
    productionMode: boolean;
  }): Promise<OnboardingPolicyGatewayStartResult>;
}

/**
 * Synthetic reference-only gateway for disposable compositions.
 */
export class SyntheticOnboardingPolicyGateway implements OnboardingPolicyGateway {
  constructor(
    private readonly options: {
      packageVersion?: number;
      integritySeed?: string;
    } = {},
  ) {}

  async refresh(input: {
    attemptId: string;
    productionMode: boolean;
  }): Promise<OnboardingPolicyGatewayStartResult> {
    if (input.productionMode) {
      return { reason: 'synthetic_in_production', status: 'blocked' };
    }

    const packageId = onboardingPolicyPackageIdSchema.parse(randomUUID());
    const interactionId =
      onboardingPolicyInteractionIdSchema.parse(randomUUID());
    const integrityDigest = createHash('sha256')
      .update(
        `${this.options.integritySeed ?? 'synthetic-policy'}:${input.attemptId}:${packageId}`,
        'utf8',
      )
      .digest('hex');

    const handoff = policyHandoffSchema.parse({
      evidenceId: onboardingPolicyEvidenceIdSchema.parse(randomUUID()),
      integrityDigest,
      interactionId,
      packageId,
      packageVersion: this.options.packageVersion ?? 1,
      status: 'ready',
    });

    return { handoff, status: 'started' };
  }
}
