import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { OnboardingReadinessProbe } from '@fitness-os/domain';

import type { PostgresConnection } from '../src/connection.js';
import {
  createPostgresOnboardingReadinessProbe,
  requiredOnboardingMigrationHashes,
} from '../src/onboarding/readiness.js';

const drizzleRoot = join(dirname(fileURLToPath(import.meta.url)), '../drizzle');

describe('onboarding schema readiness', () => {
  it('requires the additive PRD 07 onboarding migration files', () => {
    expect(existsSync(join(drizzleRoot, '0000_flippant_rick_jones.sql'))).toBe(
      true,
    );
    expect(
      existsSync(join(drizzleRoot, '0007_prd07_onboarding_invitation.sql')),
    ).toBe(true);
    expect(
      existsSync(join(drizzleRoot, '0008_prd07_onboarding_attempt.sql')),
    ).toBe(true);
    expect(
      existsSync(join(drizzleRoot, '0009_prd07_onboarding_operation.sql')),
    ).toBe(true);
    expect(
      existsSync(join(drizzleRoot, '0010_prd07_onboarding_role_mapping.sql')),
    ).toBe(true);

    const hashes = requiredOnboardingMigrationHashes();
    expect(hashes).toHaveLength(5);
    expect(new Set(hashes).size).toBe(5);
    for (const hash of hashes) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('fails closed when the base probe omits the schema component', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;
    const baseProbe: OnboardingReadinessProbe = {
      evaluate: async () => ({
        components: [
          { componentId: 'clock', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: [],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        mechanismReady: true,
        productionReady: false,
      }),
    };

    const result = await createPostgresOnboardingReadinessProbe(connection, {
      baseProbe,
      requiredHashes: ['0'.repeat(64)],
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(
      result.components.filter(
        (component) => component.componentId === 'schema',
      ),
    ).toEqual([
      {
        componentId: 'schema',
        diagnosticCode: 'migration_missing',
        state: 'not_ready',
      },
    ]);
  });

  it('normalizes duplicate base schema components to one database-derived component', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;
    const baseProbe: OnboardingReadinessProbe = {
      evaluate: async () => ({
        components: [
          {
            componentId: 'schema',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'schema',
            diagnosticCode: 'schema_mismatch',
            state: 'not_ready',
          },
        ],
        diagnosticCodes: ['schema_mismatch'],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        mechanismReady: false,
        productionReady: false,
      }),
    };

    const result = await createPostgresOnboardingReadinessProbe(connection, {
      baseProbe,
      requiredHashes: ['0'.repeat(64)],
    }).evaluate();

    expect(
      result.components.filter(
        (component) => component.componentId === 'schema',
      ),
    ).toEqual([
      {
        componentId: 'schema',
        diagnosticCode: 'migration_missing',
        state: 'not_ready',
      },
    ]);
  });

  it('removes stale base schema diagnostics after the database schema is ready', async () => {
    let executeCount = 0;
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => {
          executeCount += 1;
          return executeCount === 1
            ? []
            : [
                { tablename: 'onboarding_invitation' },
                { tablename: 'onboarding_attempt' },
                { tablename: 'onboarding_operation' },
                { tablename: 'onboarding_role_mapping' },
              ];
        },
      },
    } as unknown as PostgresConnection;
    const baseProbe: OnboardingReadinessProbe = {
      evaluate: async () => ({
        components: [
          {
            componentId: 'schema',
            diagnosticCode: 'schema_mismatch',
            state: 'not_ready',
          },
          { componentId: 'clock', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: ['schema_mismatch', 'legal_privacy_decision_required'],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        mechanismReady: false,
        productionReady: false,
      }),
    };

    const result = await createPostgresOnboardingReadinessProbe(connection, {
      baseProbe,
      requiredHashes: [],
    }).evaluate();

    expect(result.diagnosticCodes).toEqual(['legal_privacy_decision_required']);
    expect(result.components[0]).toEqual({
      componentId: 'schema',
      diagnosticCode: null,
      state: 'ready',
    });
  });
});
