import { describe, expect, it } from 'vitest';

import {
  claimAttemptRequestSchema,
  createAttemptRequestSchema,
  emptyOnboardingQuerySchema,
  inspectInvitationRequestSchema,
  invitationClaimSecretSchema,
  onboardingAttemptIdSchema,
  onboardingInvitationIdSchema,
  onboardingOperationResponseSchema,
  principalIdSchema,
  principalReferenceSchema,
  retryTokenSchema,
  studentIdSchema,
} from '../src/index.js';

const claimSecret = invitationClaimSecretSchema.parse('A'.repeat(22));
const retryToken = retryTokenSchema.parse('retry-token-000001');

describe('onboarding identity contracts', () => {
  it('keeps principal and student identifiers nominally distinct', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const principal = principalIdSchema.parse(uuid);
    const student = studentIdSchema.parse(uuid);

    expect(principal).toBe(uuid);
    expect(student).toBe(uuid);
    expect(principalIdSchema.safeParse(student).success).toBe(true);
  });

  it('rejects assigning a student identifier shape as a public request field', () => {
    expect(
      createAttemptRequestSchema.safeParse({
        retryToken,
        claimSecret,
        studentId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('does not accept a principal reference on a public command', () => {
    const reference = principalReferenceSchema.parse('p'.repeat(32));

    expect(
      claimAttemptRequestSchema.safeParse({
        retryToken,
        claimSecret,
        principalReference: reference,
      }).success,
    ).toBe(false);
  });
});

describe('onboarding public requests', () => {
  it('accepts inspect, create, and claim bodies without server-owned fields', () => {
    expect(
      inspectInvitationRequestSchema.parse({ claimSecret }),
    ).toEqual({ claimSecret });
    expect(
      createAttemptRequestSchema.parse({ retryToken, claimSecret }),
    ).toEqual({ retryToken, claimSecret });
    expect(
      claimAttemptRequestSchema.parse({ retryToken, claimSecret }),
    ).toEqual({ retryToken, claimSecret });
  });

  it('rejects caller-owned operation fields and extra keys', () => {
    expect(
      createAttemptRequestSchema.safeParse({
        retryToken,
        claimSecret,
        operationId: '22222222-2222-4222-8222-222222222222',
      }).success,
    ).toBe(false);
    expect(emptyOnboardingQuerySchema.safeParse({ page: '1' }).success).toBe(
      false,
    );
  });

  it('rejects short claim secrets and retry tokens', () => {
    expect(invitationClaimSecretSchema.safeParse('short').success).toBe(false);
    expect(retryTokenSchema.safeParse('x').success).toBe(false);
  });
});

describe('onboarding operation envelope', () => {
  it('preserves committed command outcomes instead of collapsing them', () => {
    const response = onboardingOperationResponseSchema.parse({
      operation: {
        operationId: '33333333-3333-4333-8333-333333333333',
        namespace: 'claim_attempt',
        canonicalizationVersion: 'utf8-json-sha256.v1',
        digest: 'a'.repeat(64),
        state: 'operation_committed',
      },
      result: { outcome: 'mapping_conflict' },
    });

    expect(response.result).toEqual({ outcome: 'mapping_conflict' });
  });

  it('keeps selection_required as a command result, not an operation state', () => {
    const response = onboardingOperationResponseSchema.parse({
      operation: {
        operationId: '44444444-4444-4444-8444-444444444444',
        namespace: 'create_attempt',
        canonicalizationVersion: 'utf8-json-sha256.v1',
        digest: 'b'.repeat(64),
        state: 'operation_committed',
      },
      result: {
        outcome: 'selection_required',
        attempts: [],
      },
    });

    expect(response.result?.outcome).toBe('selection_required');
    expect(response.operation.state).toBe('operation_committed');
  });

  it('accepts locator-only attempt and invitation identifiers', () => {
    expect(
      onboardingAttemptIdSchema.parse('55555555-5555-4555-8555-555555555555'),
    ).toBe('55555555-5555-4555-8555-555555555555');
    expect(
      onboardingInvitationIdSchema.parse(
        '66666666-6666-4666-8666-666666666666',
      ),
    ).toBe('66666666-6666-4666-8666-666666666666');
  });
});
