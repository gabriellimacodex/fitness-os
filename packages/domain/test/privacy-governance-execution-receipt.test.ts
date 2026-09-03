import { describe, expect, it } from 'vitest';

import {
  privacyGovernanceLifecycleBindingSchema,
  privacyProcessorExecutionReceiptSchema,
} from '@fitness-os/schemas';

import {
  createPrivacyGovernanceExecutionReceiptVerifier,
  createPrivacyProcessorExecutionReceiptVerifier,
} from '../src/privacy-governance/index.js';

describe('privacy governance execution-receipt verifier', () => {
  const binding = privacyGovernanceLifecycleBindingSchema.parse({
    requestId: '11111111-1111-4111-8111-111111111111',
    processorId: '22222222-2222-4222-8222-222222222222',
    operationId: '33333333-3333-4333-8333-333333333333',
    result: {
      outcome: 'completed',
      proofId: '44444444-4444-4444-8444-444444444444',
    },
  });

  it('verifies one exact receipt from the independent coordinator source', async () => {
    const verifier = createPrivacyGovernanceExecutionReceiptVerifier({
      listByOperationId: async () => [binding],
    });

    await expect(verifier.verify(binding)).resolves.toEqual({
      status: 'verified',
      binding,
    });
  });

  it('reports unavailable when the independent coordinator source fails', async () => {
    const verifier = createPrivacyGovernanceExecutionReceiptVerifier({
      listByOperationId: () => {
        throw new Error('coordinator offline');
      },
    });

    await expect(verifier.verify(binding)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('rejects absent, ambiguous, and mismatched coordinator receipts', async () => {
    const mismatched = privacyGovernanceLifecycleBindingSchema.parse({
      ...binding,
      processorId: '55555555-5555-4555-8555-555555555555',
    });

    for (const receipts of [[], [binding, binding], [mismatched]]) {
      const verifier = createPrivacyGovernanceExecutionReceiptVerifier({
        listByOperationId: async () => receipts,
      });
      await expect(verifier.verify(binding)).resolves.toEqual({
        status: 'invalid',
      });
    }
  });
});

describe('privacy processor execution-receipt verifier', () => {
  const receipt = privacyProcessorExecutionReceiptSchema.parse({
    requestId: '11111111-1111-4111-8111-111111111111',
    processorId: '22222222-2222-4222-8222-222222222222',
    capability: 'export',
    outcome: 'completed',
    operationId: '33333333-3333-4333-8333-333333333333',
    correlationId: '55555555-5555-4555-8555-555555555555',
  });
  const binding = {
    requestId: receipt.requestId,
    processorId: receipt.processorId,
    capability: receipt.capability,
    operationId: receipt.operationId,
    correlationId: receipt.correlationId,
  };

  it('returns the authoritative outcome from one exact receipt', async () => {
    const verifier = createPrivacyProcessorExecutionReceiptVerifier({
      listByOperationId: async () => [receipt],
    });

    await expect(verifier.verify(binding)).resolves.toEqual({
      receipt,
      status: 'verified',
    });
  });

  it('reports unavailable when the independent processor source fails', async () => {
    const verifier = createPrivacyProcessorExecutionReceiptVerifier({
      listByOperationId: () => {
        throw new Error('processor receipt source offline');
      },
    });

    await expect(verifier.verify(binding)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it.each([
    ['missing', []],
    ['ambiguous', [receipt, receipt]],
    [
      'mismatched',
      [{ ...receipt, processorId: '66666666-6666-4666-8666-666666666666' }],
    ],
    ['malformed', [null]],
  ])('rejects %s processor execution evidence', async (_case, receipts) => {
    const verifier = createPrivacyProcessorExecutionReceiptVerifier({
      listByOperationId: async () => receipts as never,
    });

    await expect(verifier.verify(binding)).resolves.toEqual({
      status: 'invalid',
    });
  });
});
