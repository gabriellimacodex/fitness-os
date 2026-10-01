import {
  attemptDetailSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  type AttemptDetail,
} from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import { SyntheticOnboardingAttemptRepository } from '../src/onboarding/synthetic-attempts.js';
import type { OnboardingAttemptRecord } from '../src/onboarding/ports.js';

const detail = (overrides: Partial<AttemptDetail> = {}): AttemptDetail =>
  attemptDetailSchema.parse({
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invitationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    lifecycle: 'policy_pending',
    ordinal: 1,
    policy: null,
    predecessorAttemptId: null,
    proposedRole: 'student',
    purpose: 'student_onboarding',
    terminalReason: null,
    ...overrides,
  });

const record = (
  overrides: Partial<AttemptDetail> = {},
  principalKey = 'principal-1',
): OnboardingAttemptRecord => ({
  createdAt: '2026-08-19T12:00:00.000Z',
  detail: detail(overrides),
  principalKey,
  updatedAt: '2026-08-19T12:00:00.000Z',
});

describe('SyntheticOnboardingAttemptRepository', () => {
  it('reports no record for get() and listByPrincipal() before any put()', async () => {
    const repo = new SyntheticOnboardingAttemptRepository();

    await expect(
      repo.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).resolves.toBe(null);
    await expect(repo.listByPrincipal('principal-1')).resolves.toEqual([]);
  });

  it('returns a stored record from get() and scopes listByPrincipal() by principalKey', async () => {
    const repo = new SyntheticOnboardingAttemptRepository();
    const mine = record({}, 'principal-1');
    const theirs = record(
      {
        attemptId: onboardingAttemptIdSchema.parse(
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        ),
      },
      'principal-2',
    );

    await repo.put(mine);
    await repo.put(theirs);

    await expect(repo.get(mine.detail.attemptId)).resolves.toEqual(mine);
    await expect(repo.listByPrincipal('principal-1')).resolves.toEqual([mine]);
    await expect(repo.get('unknown-attempt-id')).resolves.toBe(null);
  });

  it('rejects put() of an already-terminal attempt as invalid', async () => {
    const repo = new SyntheticOnboardingAttemptRepository();

    await expect(repo.put(record({ lifecycle: 'completed' }))).resolves.toBe(
      'invalid',
    );
    await expect(
      repo.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).resolves.toBe(null);
  });

  it('reports not_found for applyTransition on an attempt that was never put()', async () => {
    const repo = new SyntheticOnboardingAttemptRepository();

    await expect(
      repo.applyTransition({
        attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        next: 'ready_to_claim',
        updatedAt: '2026-08-19T12:01:00.000Z',
      }),
    ).resolves.toEqual({ reason: 'not_found', status: 'invalid' });
  });

  it('reports illegal_transition for a transition FORWARD does not allow, without mutating the record', async () => {
    const repo = new SyntheticOnboardingAttemptRepository();
    const seeded = record();
    await repo.put(seeded);

    await expect(
      repo.applyTransition({
        attemptId: seeded.detail.attemptId,
        next: 'completed',
        updatedAt: '2026-08-19T12:01:00.000Z',
      }),
    ).resolves.toEqual({ reason: 'illegal_transition', status: 'invalid' });
    await expect(repo.get(seeded.detail.attemptId)).resolves.toEqual(seeded);
  });

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
