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

import {
  createCoachBootstrapLedger,
  issueCoachBootstrapInvitation,
  type IssueCoachBootstrapInvitationOptions,
} from './bootstrap.js';
import { createOnboardingStore } from './store.js';

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
