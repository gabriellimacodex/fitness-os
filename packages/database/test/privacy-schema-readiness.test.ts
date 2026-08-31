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

  it('preserves an overridden diagnostic still used by another component', async () => {
    let executeCount = 0;
    const connection = {
      close: async () => undefined,
      db: {
        execute: async () => {
          executeCount += 1;
          return executeCount === 1
            ? []
            : [
                { tablename: 'privacy_policy_package_version' },
                { tablename: 'privacy_purpose_version' },
                { tablename: 'privacy_processor_registration' },
                { tablename: 'privacy_authorization_evidence' },
                { tablename: 'privacy_withdrawal' },
                { tablename: 'privacy_audit_event' },
                { tablename: 'privacy_subject_request' },
                { tablename: 'privacy_subject_request_transition' },
              ];
        },
      },
    } as unknown as PostgresConnection;
    const baseProbe: PrivacyReadinessProbe = {
      evaluate: async () => ({
        canonicalizationVersion: 'privacy-governance.canonical.v1',
        components: [
          { componentId: 'contracts', diagnosticCode: null, state: 'ready' },
          {
            componentId: 'migrations',
            diagnosticCode: 'migration_missing',
            state: 'not_ready',
          },
          {
            componentId: 'repositories',
            diagnosticCode: 'repository_unavailable',
            state: 'unavailable',
          },
          { componentId: 'audit_sink', diagnosticCode: null, state: 'ready' },
          {
            componentId: 'expected_inventory',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'runtime_processors',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'governance_lifecycle',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'identity_boundary',
            diagnosticCode: null,
            state: 'ready',
          },
          {
            componentId: 'policy_package',
            diagnosticCode: 'repository_unavailable',
            state: 'unavailable',
          },
          { componentId: 'recovery', diagnosticCode: null, state: 'ready' },
        ],
        diagnosticCodes: [
          'legal_privacy_decision_required',
          'migration_missing',
          'repository_unavailable',
        ],
        evaluatedAt: '2026-08-31T00:00:00.000Z',
        inventoryVersionDigest: 'b'.repeat(64),
        mechanismReady: false,
        productionReady: false,
        schemaDigest: 'a'.repeat(64),
      }),
    };

    const result = await createPostgresPrivacyReadinessProbe(connection, {
      baseProbe,
      requiredHashes: [],
    }).evaluate();

    expect(result.diagnosticCodes).toContain('repository_unavailable');
    expect(result.diagnosticCodes).not.toContain('migration_missing');
  });
});
