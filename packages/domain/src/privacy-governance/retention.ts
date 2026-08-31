import { createHash } from 'node:crypto';

import {
  canonicalizeRetentionPreviewApprovedExceptionIds,
  retentionPreviewCanonicalInputSchema,
  sortPrivacySetIdentifiers,
  type PrivacyPolicyVersionId,
  type PrivacyRetentionExceptionId,
  type PrivacyRetentionRuleReference,
  type RetentionPreviewCanonicalInput,
} from '@fitness-os/schemas';

import type { PrivacyRetentionRuleRepository } from './ports.js';

export type RetentionPreviewPlan =
  | {
      status: 'planned';
      preview: {
        policyVersionId: PrivacyPolicyVersionId;
        inventoryVersionDigest: string;
        processorDescriptorDigests: string[];
        watermark: string;
        selectionDigest: string;
        approvedExceptionIds: PrivacyRetentionExceptionId[];
        synthetic: true;
      };
    }
  | {
      status: 'invalid';
      reason:
        | 'policy_synthetic_in_production'
        | 'missing_inventory_digest'
        | 'missing_processor_descriptors'
        | 'missing_watermark';
    };

/**
 * Read-only retention preview planning. Never deletes or transforms data.
 * Production mode rejects synthetic policy input.
 */
export function planRetentionPreview(input: {
  policyVersionId: PrivacyPolicyVersionId;
  policySynthetic: boolean;
  inventoryVersionDigest: string;
  processorDescriptorDigests: readonly string[];
  watermark: string;
  approvedExceptionIds: readonly PrivacyRetentionExceptionId[];
  productionMode: boolean;
}): RetentionPreviewPlan {
  if (input.productionMode && input.policySynthetic) {
    return { reason: 'policy_synthetic_in_production', status: 'invalid' };
  }

  if (input.inventoryVersionDigest.length === 0) {
    return { reason: 'missing_inventory_digest', status: 'invalid' };
  }

  if (input.processorDescriptorDigests.length === 0) {
    return { reason: 'missing_processor_descriptors', status: 'invalid' };
  }

  if (input.watermark.length === 0) {
    return { reason: 'missing_watermark', status: 'invalid' };
  }

  const fragment: RetentionPreviewCanonicalInput =
    retentionPreviewCanonicalInputSchema.parse({
      approvedExceptionIds: [...input.approvedExceptionIds],
    });
  const canonical = canonicalizeRetentionPreviewApprovedExceptionIds(fragment);
  const processorDescriptorDigests = sortPrivacySetIdentifiers([
    ...input.processorDescriptorDigests,
  ]);

  const selectionDigest = createHash('sha256')
    .update(
      JSON.stringify({
        approvedExceptionIds: canonical.approvedExceptionIds,
        inventoryVersionDigest: input.inventoryVersionDigest,
        policyVersionId: input.policyVersionId,
        processorDescriptorDigests,
        watermark: input.watermark,
      }),
      'utf8',
    )
    .digest('hex');

  return {
    preview: {
      approvedExceptionIds: canonical.approvedExceptionIds,
      inventoryVersionDigest: input.inventoryVersionDigest,
      policyVersionId: input.policyVersionId,
      processorDescriptorDigests,
      selectionDigest,
      synthetic: true,
      watermark: input.watermark,
    },
    status: 'planned',
  };
}

export type RetentionRuleSelectionResult =
  | { status: 'selected'; rule: PrivacyRetentionRuleReference }
  | {
      status: 'invalid';
      reason:
        'no_active_retention_rule' | 'retention_rule_not_active_for_scope';
    };

/**
 * Selects the caller-identified retention-rule version from the active set
 * bound to a category/purpose pair. Never infers "latest" or "default" — the
 * caller's `ruleVersionId` must already be present in `activeRules`, mirroring
 * `PrivacyRetentionRuleRepository.listActiveForCategoryAndPurpose`'s own
 * contract that it never picks a version on the caller's behalf.
 */
export function selectActiveRetentionRule(input: {
  activeRules: readonly PrivacyRetentionRuleReference[];
  ruleVersionId: string;
}): RetentionRuleSelectionResult {
  if (input.activeRules.length === 0) {
    return { reason: 'no_active_retention_rule', status: 'invalid' };
  }

  const rule = input.activeRules.find(
    (candidate) => candidate.ruleVersionId === input.ruleVersionId,
  );
  if (rule === undefined) {
    return { reason: 'retention_rule_not_active_for_scope', status: 'invalid' };
  }

  return { rule, status: 'selected' };
}

export type RetentionPreviewPlanWithRule =
  | RetentionPreviewPlan
  | {
      status: 'invalid';
      reason:
        | 'no_active_retention_rule'
        | 'retention_rule_not_active_for_scope'
        | 'retention_rule_policy_mismatch';
    };

/**
 * Fail-closed wrapper around `planRetentionPreview`: a preview may only be
 * planned when an active retention rule already governs the exact
 * category/purpose pair and carries the same policy provenance as the preview.
 * An unconfigured or unmatched rule denies the preview rather than defaulting
 * to indefinite retention or immediate deletion, per PRD 21's
 * retention-enforcement business rule.
 */
export async function planRetentionPreviewWithRetentionRule(
  input: {
    retentionRules: PrivacyRetentionRuleRepository;
    engineeringCategoryId: string;
    purposeVersionId: string;
    ruleVersionId: string;
  } & Parameters<typeof planRetentionPreview>[0],
): Promise<RetentionPreviewPlanWithRule> {
  const {
    retentionRules,
    engineeringCategoryId,
    purposeVersionId,
    ruleVersionId,
    ...previewInput
  } = input;

  const activeRules = await retentionRules.listActiveForCategoryAndPurpose(
    engineeringCategoryId,
    purposeVersionId,
  );
  const selection = selectActiveRetentionRule({ activeRules, ruleVersionId });
  if (selection.status === 'invalid') {
    return selection;
  }
  if (selection.rule.policyVersionId !== previewInput.policyVersionId) {
    return { reason: 'retention_rule_policy_mismatch', status: 'invalid' };
  }

  return planRetentionPreview(previewInput);
}

export type RetentionExecutionAuthorization =
  | {
      status: 'allowed_synthetic_test';
    }
  | {
      status: 'hard_disabled';
      reason:
        | 'production_path'
        | 'synthetic_fixtures_required'
        | 'preview_mismatch'
        | 'preview_expired_or_executed';
    };

/**
 * Production retention execution stays hard-disabled. Synthetic disposable
 * tests may proceed only outside productionMode with synthetic fixtures and
 * matching digests.
 */
export function authorizeRetentionExecution(input: {
  productionMode: boolean;
  policySynthetic: boolean;
  authoritySynthetic: boolean;
  previewExecuted: boolean;
  previewExpired: boolean;
  digestsMatch: boolean;
}): RetentionExecutionAuthorization {
  if (input.productionMode) {
    return { reason: 'production_path', status: 'hard_disabled' };
  }

  if (!input.policySynthetic || !input.authoritySynthetic) {
    return {
      reason: 'synthetic_fixtures_required',
      status: 'hard_disabled',
    };
  }

  if (input.previewExecuted || input.previewExpired) {
    return {
      reason: 'preview_expired_or_executed',
      status: 'hard_disabled',
    };
  }

  if (!input.digestsMatch) {
    return { reason: 'preview_mismatch', status: 'hard_disabled' };
  }

  return { status: 'allowed_synthetic_test' };
}
