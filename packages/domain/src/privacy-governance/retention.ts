import { createHash } from 'node:crypto';

import {
  canonicalizeRetentionPreviewApprovedExceptionIds,
  retentionPreviewCanonicalInputSchema,
  sortPrivacySetIdentifiers,
  type PrivacyPolicyVersionId,
  type PrivacyRetentionExceptionId,
  type PrivacyRetentionPreviewRecord,
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

type PlannedRetentionPreview = Extract<
  RetentionPreviewPlan,
  { status: 'planned' }
>;

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
        | 'no_active_retention_rule'
        | 'retention_rule_not_active_for_scope'
        | 'retention_rule_ambiguous';
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

  const matchingRules = input.activeRules.filter(
    (candidate) => candidate.ruleVersionId === input.ruleVersionId,
  );
  if (matchingRules.length === 0) {
    return { reason: 'retention_rule_not_active_for_scope', status: 'invalid' };
  }
  if (matchingRules.length > 1) {
    return { reason: 'retention_rule_ambiguous', status: 'invalid' };
  }

  return { rule: matchingRules[0]!, status: 'selected' };
}

export type RetentionPreviewPlanWithRule =
  | {
      status: 'planned';
      preview: PlannedRetentionPreview['preview'] & {
        retentionRuleDigest: string;
        retentionRuleVersionId: PrivacyRetentionRuleReference['ruleVersionId'];
      };
    }
  | Exclude<RetentionPreviewPlan, { status: 'planned' }>
  | {
      status: 'invalid';
      reason:
        | 'no_active_retention_rule'
        | 'retention_rule_not_active_for_scope'
        | 'retention_rule_ambiguous'
        | 'retention_rule_policy_mismatch'
        | 'retention_rule_synthetic_mismatch';
    };

/** Stable opaque digest of the exact retention-rule authority. */
export function digestRetentionRuleReference(
  rule: PrivacyRetentionRuleReference,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        action: rule.action,
        canonicalizationVersion: rule.canonicalizationVersion,
        engineeringCategoryId: rule.engineeringCategoryId,
        parametersDigest: rule.parametersDigest,
        policyVersionId: rule.policyVersionId,
        purposeVersionId: rule.purposeVersionId,
        ruleId: rule.ruleId,
        ruleVersionId: rule.ruleVersionId,
        synthetic: rule.synthetic,
      }),
      'utf8',
    )
    .digest('hex');
}

/**
 * Fail-closed wrapper around `planRetentionPreview`: a preview may only be
 * planned when exactly one active retention rule governs the category/purpose
 * pair and carries the same policy and synthetic provenance as the preview.
 * The exact rule version and its opaque digest are bound into the deterministic
 * selection digest. An unconfigured, ambiguous, or unmatched rule denies the
 * preview rather than defaulting to indefinite retention or immediate
 * deletion, per PRD 21's retention-enforcement business rule.
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
  if (selection.rule.synthetic !== previewInput.policySynthetic) {
    return { reason: 'retention_rule_synthetic_mismatch', status: 'invalid' };
  }

  const plan = planRetentionPreview(previewInput);
  if (plan.status !== 'planned') {
    return plan;
  }

  const retentionRuleDigest = digestRetentionRuleReference(selection.rule);
  const selectionDigest = createHash('sha256')
    .update(
      JSON.stringify({
        previewSelectionDigest: plan.preview.selectionDigest,
        retentionRuleDigest,
        retentionRuleVersionId: selection.rule.ruleVersionId,
      }),
      'utf8',
    )
    .digest('hex');

  return {
    preview: {
      ...plan.preview,
      retentionRuleDigest,
      retentionRuleVersionId: selection.rule.ruleVersionId,
      selectionDigest,
    },
    status: 'planned',
  };
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

/**
 * Composes `authorizeRetentionExecution` with a real persisted retention
 * preview instead of trusting caller-supplied `previewExecuted` /
 * `previewExpired` / `digestsMatch` booleans directly. This is the
 * persisted-preview lookup the Technical Design's execution preflight
 * requires — "an unexpired, unexecuted preview whose inventory and processor
 * digests still match" — derived here from the exact repository row rather
 * than an unverified request field, so a caller cannot claim a preview is
 * current or unexecuted that the repository does not actually hold.
 *
 * `preview` is the exact row a caller's own repository lookup by
 * `requestedSelectionDigest` returned; `null` means no such preview was
 * found and is treated as a digest mismatch, never as "no preview needed".
 * The current inventory and processor digests must come from the trusted
 * execution environment. They are compared independently with the persisted
 * preview so a once-valid preview cannot authorize execution after either
 * dependency changes.
 *
 * `previewTtlMs` has no default: the Technical Design states "No duration
 * ... is defaulted. An absent parameter prevents evaluation or execution",
 * so the caller's own approved rule/operational configuration must supply
 * the exact bound; this function never invents one. It fails closed
 * (`RangeError`) on a non-finite/non-positive TTL or an unparseable
 * `nowUtcMs/preview.createdAt`, rather than silently treating a malformed
 * timestamp as "not yet expired".
 */
export function resolveRetentionExecutionAuthorization(input: {
  productionMode: boolean;
  policySynthetic: boolean;
  authoritySynthetic: boolean;
  preview: PrivacyRetentionPreviewRecord | null;
  requestedSelectionDigest: string;
  currentInventoryVersionDigest: string;
  currentProcessorDescriptorDigests: readonly string[];
  nowUtcMs: string;
  previewTtlMs: number;
}): RetentionExecutionAuthorization {
  if (!Number.isFinite(input.previewTtlMs) || input.previewTtlMs <= 0) {
    throw new RangeError(
      'resolveRetentionExecutionAuthorization requires a positive, finite previewTtlMs.',
    );
  }

  const nowMs = Date.parse(input.nowUtcMs);
  if (!Number.isFinite(nowMs)) {
    throw new RangeError(
      'resolveRetentionExecutionAuthorization requires a parseable nowUtcMs.',
    );
  }

  const { preview } = input;

  if (preview === null) {
    return authorizeRetentionExecution({
      authoritySynthetic: input.authoritySynthetic,
      digestsMatch: false,
      policySynthetic: input.policySynthetic,
      previewExecuted: false,
      previewExpired: false,
      productionMode: input.productionMode,
    });
  }

  const createdAtMs = Date.parse(preview.createdAt);
  if (!Number.isFinite(createdAtMs)) {
    throw new RangeError(
      'resolveRetentionExecutionAuthorization requires a parseable preview.createdAt.',
    );
  }

  const currentProcessorDescriptorDigests = sortPrivacySetIdentifiers(
    input.currentProcessorDescriptorDigests,
  );
  const previewProcessorDescriptorDigests = sortPrivacySetIdentifiers(
    preview.processorDescriptorDigests,
  );
  const processorDigestsMatch =
    currentProcessorDescriptorDigests.length ===
      previewProcessorDescriptorDigests.length &&
    currentProcessorDescriptorDigests.every(
      (digest, index) => digest === previewProcessorDescriptorDigests[index],
    );

  return authorizeRetentionExecution({
    authoritySynthetic: input.authoritySynthetic,
    digestsMatch:
      preview.selectionDigest === input.requestedSelectionDigest &&
      preview.inventoryVersionDigest === input.currentInventoryVersionDigest &&
      processorDigestsMatch,
    policySynthetic: input.policySynthetic,
    previewExecuted: preview.status === 'executed',
    previewExpired: nowMs - createdAtMs >= input.previewTtlMs,
    productionMode: input.productionMode,
  });
}
