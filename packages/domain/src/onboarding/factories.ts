import { randomBytes, randomUUID } from 'node:crypto';

import {
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  onboardingOperationIdSchema,
  type OnboardingAttemptId,
  type OnboardingInvitationId,
  type OnboardingOperationId,
} from '@fitness-os/schemas';

/**
 * Generate nominal cryptographically random IDs by entity kind.
 */
export interface OnboardingIdFactory {
  attemptId(): OnboardingAttemptId;
  invitationId(): OnboardingInvitationId;
  operationId(): OnboardingOperationId;
}

export class CryptoOnboardingIdFactory implements OnboardingIdFactory {
  attemptId(): OnboardingAttemptId {
    return onboardingAttemptIdSchema.parse(randomUUID());
  }

  invitationId(): OnboardingInvitationId {
    return onboardingInvitationIdSchema.parse(randomUUID());
  }

  operationId(): OnboardingOperationId {
    return onboardingOperationIdSchema.parse(randomUUID());
  }
}

/**
 * Generate claim secrets and other bounded random material.
 */
export interface OnboardingSecretFactory {
  claimSecret(): string;
}

export class CryptoOnboardingSecretFactory implements OnboardingSecretFactory {
  claimSecret(): string {
    return randomBytes(24).toString('base64url');
  }
}
