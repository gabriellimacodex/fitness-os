import { describe, expect, it, vi } from 'vitest';

vi.mock('@fitness-os/database', () => ({
  createPostgresPrivacyAuditSink: vi.fn(() => ({ append: vi.fn() })),
  createPostgresPrivacyAuthorizationEvidenceLedger: vi.fn(() => ({
    appendEvidence: vi.fn(),
    appendWithdrawal: vi.fn(),
    getAuthoritativeWithdrawal: vi.fn(),
    getEvidence: vi.fn(),
  })),
  createPostgresPrivacySubjectRequestRepository: vi.fn(() => ({
    applyTransition: vi.fn(),
    get: vi.fn(),
    listTransitions: vi.fn(),
    put: vi.fn(),
  })),
}));

import {
  createPostgresPrivacyAuditSink,
  createPostgresPrivacyAuthorizationEvidenceLedger,
  createPostgresPrivacySubjectRequestRepository,
} from '@fitness-os/database';

import { createPrivacyPgPersistence } from './pg-persistence.js';

describe('privacy PG persistence bundle', () => {
  it('composes disposable evidence, audit, and subject-request ports', () => {
    const connection = { db: {}, close: async () => undefined } as never;
    const persistence = createPrivacyPgPersistence(connection);

    expect(
      createPostgresPrivacyAuthorizationEvidenceLedger,
    ).toHaveBeenCalledWith(connection);
    expect(createPostgresPrivacyAuditSink).toHaveBeenCalledWith(connection);
    expect(createPostgresPrivacySubjectRequestRepository).toHaveBeenCalledWith(
      connection,
    );
    expect(persistence.evidence).toBeDefined();
    expect(persistence.audit).toBeDefined();
    expect(persistence.subjectRequests).toBeDefined();
  });
});
