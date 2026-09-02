export type ProposedRole = 'student' | 'coach';

export type ClaimDenial =
  | { status: 'allowed' }
  | { status: 'hard_disabled'; reason: 'second_role' | 'self_coach' };

export function evaluateClaimEligibility(input: {
  alreadyMappedRoles: readonly ProposedRole[];
  proposedRole: ProposedRole;
  invitationPurpose: 'coach_bootstrap' | 'student_onboarding';
  targetCoachIsSelf: boolean;
}): ClaimDenial {
  if (input.alreadyMappedRoles.length > 0) {
    return { reason: 'second_role', status: 'hard_disabled' };
  }

  if (
    input.invitationPurpose === 'student_onboarding' &&
    input.targetCoachIsSelf
  ) {
    return { reason: 'self_coach', status: 'hard_disabled' };
  }

  return { status: 'allowed' };
}
