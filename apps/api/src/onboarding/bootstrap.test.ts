import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CryptoOnboardingIdFactory,
  CryptoOnboardingSecretFactory,
  FixedTrustedClock,
  SyntheticOnboardingTransitionSink,
} from '@fitness-os/domain';
import { retryTokenSchema } from '@fitness-os/schemas';
import { describe, expect, it } from 'vitest';

import type {
  OnboardingInvitationRecord,
  OnboardingOperationRecord,
} from '@fitness-os/domain';

import {
  createCoachBootstrapLedger,
  issueCoachBootstrapInvitation,
  type IssueCoachBootstrapInvitationOptions,
} from './bootstrap.js';
import type { OnboardingPgPersistence } from './pg-persistence.js';
import { createOnboardingStore } from './store.js';

/**
 * Minimal fake satisfying `OnboardingPgPersistence` for unit-level
 * verification of the coach-bootstrap → `persistOperation` write-through.
 * Only `invitations`/`operations` are exercised by
 * `issueCoachBootstrapInvitation`; the remaining ports throw if a future
 * change starts calling them unexpectedly.
 */
function createFakeOnboardingPersistence(): OnboardingPgPersistence & {
  operationRows: Map<string, OnboardingOperationRecord>;
} {
  const invitationRows = new Map<string, OnboardingInvitationRecord>();
  const operationRows = new Map<string, OnboardingOperationRecord>();
  const notImplemented = (): never => {
    throw new Error('not implemented in this fake');
  };

  return {
    attempts: {
      applyTransition: notImplemented,
      get: notImplemented,
      listByPrincipal: notImplemented,
      put: notImplemented,
    },
    invitations: {
      applyClaim: notImplemented,
      applyRevoke: notImplemented,
      get: async (invitationId) => invitationRows.get(invitationId) ?? null,
      getByClaimDigest: notImplemented,
      listByTargetCoach: notImplemented,
      put: async (record) => {
        invitationRows.set(record.invitationId, record);
        return 'accepted';
      },
    },
    mappings: {
      get: notImplemented,
      listByPrincipal: notImplemented,
      put: notImplemented,
    },
    nowUtcMs: () => '2026-08-27T00:00:00.000Z',
    operations: {
      getByBindingKey: async (bindingKey) => {
        for (const record of operationRows.values()) {
          if (record.bindingKey === bindingKey) {
            return record;
          }
        }
        return null;
      },
      getByOperationId: async (operationId) =>
        operationRows.get(operationId) ?? null,
      put: async (record) => {
        const existing = operationRows.get(record.operationId);
        if (existing !== undefined) {
          return { operation: existing, status: 'replay' };
        }
        operationRows.set(record.operationId, record);
        return { operation: record, status: 'accepted' };
      },
    },
    operationRows,
    principalBinding: {
      getByPrincipalKey: notImplemented,
      resolveOrEstablish: notImplemented,
    },
    transitions: {
      append: async () => 'accepted',
    },
  };
}

const RETRY_TOKEN = retryTokenSchema.parse('synthetic-bootstrap-retry-01');
const OTHER_RETRY_TOKEN = retryTokenSchema.parse(
  'synthetic-bootstrap-retry-02',
);

function buildOptions(
  overrides?: Partial<IssueCoachBootstrapInvitationOptions>,
): IssueCoachBootstrapInvitationOptions {
  return {
    clock: new FixedTrustedClock('2026-08-27T00:00:00.000Z'),
    environment: 'synthetic',
    idFactory: new CryptoOnboardingIdFactory(),
    ledger: createCoachBootstrapLedger(),
    secretFactory: new CryptoOnboardingSecretFactory(),
    store: createOnboardingStore(),
    transitionSink: new SyntheticOnboardingTransitionSink(),
    ...overrides,
  };
}

describe('issueCoachBootstrapInvitation', () => {
  it('issues a coach_bootstrap invitation and commits the operation', async () => {
    const options = buildOptions();

    const result = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: RETRY_TOKEN,
    });

    expect(result.state).toBe('operation_committed');
    if (result.state !== 'operation_committed') {
      throw new Error('expected operation_committed');
    }
    expect(result.result.issued.purpose).toBe('coach_bootstrap');
    expect(result.result.issued.state).toBe('issued');
    expect(result.result.outcome).toBe('command_succeeded');

    const stored = options.store.invitations.get(
      result.result.issued.invitationId,
    );
    expect(stored?.purpose).toBe('coach_bootstrap');
    expect(stored?.proposedRole).toBe('coach');
    expect(stored?.targetCoachPrincipalKey).toBeNull();
  });

  it('replays the committed result for a repeat of the same operator/retry token', async () => {
    const options = buildOptions();

    const first = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: RETRY_TOKEN,
    });
    const second = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: RETRY_TOKEN,
    });

    expect(first.state).toBe('operation_committed');
    expect(second.state).toBe('operation_replayed');
    if (
      first.state !== 'operation_committed' ||
      second.state !== 'operation_replayed'
    ) {
      throw new Error('expected committed then replayed');
    }
    expect(second.result).toEqual(first.result);
    expect(options.store.invitations.size).toBe(1);
  });

  it('scopes the operation binding by operator identity, not retry token alone', async () => {
    const options = buildOptions();
    const store = options.store;

    await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: RETRY_TOKEN,
    });

    // The operation binding key includes the authority scope, so the same
    // retryToken value reused by a different attributable operator commits
    // its own independent operation rather than replaying operator-a's.
    const other = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-b',
      retryToken: RETRY_TOKEN,
    });
    expect(other.state).toBe('operation_committed');
    expect(store.invitations.size).toBe(2);
  });

  it('denies issuance in production without an explicit allow', async () => {
    const options = buildOptions({ environment: 'production' });

    const result = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: RETRY_TOKEN,
    });

    expect(result).toEqual({
      reason: 'production_bootstrap_disabled',
      state: 'denied',
    });
    expect(options.store.invitations.size).toBe(0);
  });

  it('allows production issuance only with an explicit allow flag', async () => {
    const options = buildOptions({
      allowProductionBootstrap: true,
      environment: 'production',
    });

    const result = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: OTHER_RETRY_TOKEN,
    });

    expect(result.state).toBe('operation_committed');
  });

  it('denies an empty or unbounded operator identity', async () => {
    const options = buildOptions();

    await expect(
      issueCoachBootstrapInvitation(options, {
        operatorId: '   ',
        retryToken: RETRY_TOKEN,
      }),
    ).resolves.toEqual({ reason: 'invalid_operator_id', state: 'denied' });

    await expect(
      issueCoachBootstrapInvitation(options, {
        operatorId: 'x'.repeat(201),
        retryToken: RETRY_TOKEN,
      }),
    ).resolves.toEqual({ reason: 'invalid_operator_id', state: 'denied' });

    expect(options.store.invitations.size).toBe(0);
  });

  it('denies a malformed retry token', async () => {
    const options = buildOptions();

    await expect(
      issueCoachBootstrapInvitation(options, {
        operatorId: 'operator-a',
        retryToken: 'too-short',
      }),
    ).resolves.toEqual({ reason: 'invalid_retry_token', state: 'denied' });

    expect(options.store.invitations.size).toBe(0);
  });

  it('commits exactly once under concurrent identical retries (Agent 90 R1 HIGH)', async () => {
    const options = buildOptions();

    const [first, second] = await Promise.all([
      issueCoachBootstrapInvitation(options, {
        operatorId: 'operator-a',
        retryToken: RETRY_TOKEN,
      }),
      issueCoachBootstrapInvitation(options, {
        operatorId: 'operator-a',
        retryToken: RETRY_TOKEN,
      }),
    ]);

    const states = [first.state, second.state].sort();
    expect(states).toEqual(['operation_committed', 'operation_replayed']);

    const committed = first.state === 'operation_committed' ? first : second;
    const replayed = first.state === 'operation_replayed' ? first : second;
    if (
      committed.state !== 'operation_committed' ||
      replayed.state !== 'operation_replayed'
    ) {
      throw new Error('expected one committed and one replayed');
    }
    expect(replayed.result).toEqual(committed.result);
    expect(options.store.invitations.size).toBe(1);
  });

  it('records append-only transition evidence for the issuance', async () => {
    const transitionSink = new SyntheticOnboardingTransitionSink();
    const options = buildOptions({ transitionSink });

    const result = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-a',
      retryToken: RETRY_TOKEN,
    });
    if (result.state !== 'operation_committed') {
      throw new Error('expected operation_committed');
    }

    const recorded = transitionSink.list();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      aggregate: 'invitation',
      aggregateId: result.result.issued.invitationId,
      nextState: 'issued',
      previousState: 'unissued',
      reason: 'issue_coach_bootstrap_invitation',
    });
  });

  it('writes the committed operation through persistOperation under issue_coach_bootstrap_invitation when persistence is supplied', async () => {
    const persistence = createFakeOnboardingPersistence();
    const options = buildOptions({ persistence });

    const result = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-pg',
      retryToken: RETRY_TOKEN,
    });
    if (result.state !== 'operation_committed') {
      throw new Error('expected operation_committed');
    }

    const stored = persistence.operationRows.get(result.operationId);
    expect(stored?.namespace).toBe('issue_coach_bootstrap_invitation');
    expect(stored?.digest).toBe(result.digest);
    expect(stored?.principalKey).toBe(`operator:synthetic:operator-pg`);
  });

  it('does not persist a second operation row when a repeat operator/retry token replays', async () => {
    const persistence = createFakeOnboardingPersistence();
    const options = buildOptions({ persistence });

    await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-pg-2',
      retryToken: RETRY_TOKEN,
    });
    const second = await issueCoachBootstrapInvitation(options, {
      operatorId: 'operator-pg-2',
      retryToken: RETRY_TOKEN,
    });

    expect(second.state).toBe('operation_replayed');
    expect(persistence.operationRows.size).toBe(1);
  });
});

describe('coach-bootstrap non-public reachability (Agent 90 R1 MEDIUM)', () => {
  it('is never referenced by the Fastify route registration or app composition source', () => {
    const routesSource = readFileSync(
      fileURLToPath(new URL('./routes.ts', import.meta.url)),
      'utf8',
    );
    const appSource = readFileSync(
      fileURLToPath(new URL('../app.ts', import.meta.url)),
      'utf8',
    );

    for (const source of [routesSource, appSource]) {
      expect(source).not.toContain('issueCoachBootstrapInvitation');
      expect(source).not.toContain('createCoachBootstrapLedger');
      expect(source).not.toContain('onboarding/bootstrap');
    }
  });
});
