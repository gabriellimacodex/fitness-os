import { describe, expect, it } from 'vitest';

import type { PrivacyReadinessProbe } from '@fitness-os/domain';

import type { PostgresConnection } from '../src/connection.js';
import { createPostgresPrivacyReadinessProbe } from '../src/privacy/readiness.js';

describe('privacy schema readiness', () => {
  it('fails closed when the base probe omits migrations and repositories', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;
    const baseProbe: PrivacyReadinessProbe = {
      evaluate: async () => ({
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        components: [
          { componentId: 'contracts', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: [],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        inventoryVersionDigest: 'b'.repeat(64),
        mechanismReady: true,
        productionReady: false,
        schemaDigest: 'a'.repeat(64),
      }),
    };

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      baseProbe,
      requiredHashes: ['0'.repeat(64)],
    }).evaluate();

    expect(result.mechanismReady).toBe(false);
    expect(
      result.components.filter((component) =>
        ['migrations', 'repositories'].includes(component.componentId),
      ),
    ).toEqual([
      {
        componentId: 'migrations',
        diagnosticCode: 'migration_missing',
        state: 'not_ready',
      },
      {
        componentId: 'repositories',
        diagnosticCode: 'repository_unavailable',
        state: 'not_ready',
      },
    ]);
  });

  it('keeps migrations ready when only required privacy tables are missing', async () => {
    const connection = {
      close: async () => undefined,
      db: { execute: async () => [] },
    } as unknown as PostgresConnection;

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      evaluatedAt: '2026-08-31T00:00:00.000Z',
      requiredHashes: [],
    }).evaluate();

    expect(result.components).toContainEqual({
      componentId: 'migrations',
      diagnosticCode: null,
      state: 'ready',
    });
    expect(result.components).toContainEqual({
      componentId: 'repositories',
      diagnosticCode: 'repository_unavailable',
      state: 'not_ready',
    });
  });
});
