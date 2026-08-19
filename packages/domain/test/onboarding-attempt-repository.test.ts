import {
  attemptDetailSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingAttemptRepository } from '../src/onboarding/synthetic-attempts.js';

describe('SyntheticOnboardingAttemptRepository', () => {
  it('puts nonterminal attempts and transitions to completed', async () => {
    const repo = new SyntheticOnboardingAttemptRepository();
    const attemptId = onboardingAttemptIdSchema.parse(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    const record = {
      createdAt: '2026-08-19T12:00:00.000Z',
      detail: attemptDetailSchema.parse({
        attemptId,
        invitationId: onboardingInvitationIdSchema.parse(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ),
        lifecycle: 'policy_pending',
        ordinal: 1,
        policy: null,
        predecessorAttemptId: null,
        proposedRole: 'student',
        purpose: 'student_onboarding',
        terminalReason: null,
      }),
      principalKey: 'principal-1',
      updatedAt: '2026-08-19T12:00:00.000Z',
    };

    await expect(repo.put(record)).resolves.toBe('accepted');
    await expect(repo.put(record)).resolves.toBe('conflict');

    const ready = await repo.applyTransition({
      attemptId,
      next: 'ready_to_claim',
      updatedAt: '2026-08-19T12:01:00.000Z',
    });
    expect(ready.status).toBe('advanced');

    const completed = await repo.applyTransition({
      attemptId,
      next: 'completed',
      updatedAt: '2026-08-19T12:02:00.000Z',
    });
    expect(completed.status).toBe('advanced');
    if (completed.status === 'advanced') {
      expect(completed.attempt.detail.lifecycle).toBe('completed');
    }
    await expect(
      repo.applyTransition({
        attemptId,
        next: 'terminal',
        terminalReason: 'abandoned',
        updatedAt: '2026-08-19T12:03:00.000Z',
      }),
    ).resolves.toMatchObject({ status: 'already_terminal' });
  });
});
