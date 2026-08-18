import type {
  PrivacyOperationId,
  PrivacyWithdrawalReference,
} from '@fitness-os/schemas';
import { privacyWithdrawalReferenceSchema } from '@fitness-os/schemas';

export type AuthoritativeEvidenceState = 'active' | 'withdrawn';

export function authoritativeEvidenceState(
  withdrawal: PrivacyWithdrawalReference | null,
): AuthoritativeEvidenceState {
  if (withdrawal === null) {
    return 'active';
  }

  return withdrawal.state === 'withdrawn' ? 'withdrawn' : 'active';
}

export type WithdrawalPlanResult =
  | {
      status: 'accepted';
      withdrawal: PrivacyWithdrawalReference;
    }
  | {
      status: 'idempotent_replay';
      withdrawal: PrivacyWithdrawalReference;
    }
  | {
      status: 'already_withdrawn';
      withdrawal: PrivacyWithdrawalReference;
    }
  | {
      status: 'conflict';
    };

/**
 * Pure withdrawal transition against append-only evidence.
 * Does not mutate the original evidence record.
 */
export function planWithdrawal(input: {
  existing: PrivacyWithdrawalReference | null;
  withdrawalId: PrivacyWithdrawalReference['withdrawalId'];
  evidenceId: PrivacyWithdrawalReference['evidenceId'];
  operationId: PrivacyOperationId;
  withdrawnAt: string;
}): WithdrawalPlanResult {
  if (input.existing !== null) {
    if (
      input.existing.operationId === input.operationId &&
      input.existing.evidenceId === input.evidenceId
    ) {
      return {
        status: 'idempotent_replay',
        withdrawal: {
          ...input.existing,
          processingOutcome: 'idempotent_replay',
        },
      };
    }

    if (input.existing.state === 'withdrawn') {
      return {
        status: 'already_withdrawn',
        withdrawal: input.existing,
      };
    }

    return { status: 'conflict' };
  }

  const withdrawal = privacyWithdrawalReferenceSchema.parse({
    withdrawalId: input.withdrawalId,
    evidenceId: input.evidenceId,
    state: 'withdrawn',
    withdrawnAt: input.withdrawnAt,
    operationId: input.operationId,
    processingOutcome: 'accepted',
  });

  return { status: 'accepted', withdrawal };
}
