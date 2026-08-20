import { eq } from 'drizzle-orm';
import type {
  PrivacyPolicyPackageRepository,
  PrivacyPurposeRegistry,
  PrivacyReferencePutResult,
  PrivacyRuntimeProcessorRegistry,
} from '@fitness-os/domain';
import {
  canonicalizePrivacyProcessorDescriptorReference,
  canonicalizePrivacyPurposeVersionReference,
  privacyPolicyPackageReferenceSchema,
  privacyProcessorDescriptorReferenceSchema,
  privacyPurposeVersionReferenceSchema,
  type PrivacyPolicyPackageReference,
  type PrivacyProcessorDescriptorReference,
  type PrivacyPurposeVersionReference,
} from '@fitness-os/schemas';

import type { PostgresConnection } from '../connection.js';
import {
  privacyPolicyPackageVersion,
  privacyProcessorRegistration,
  privacyPurposeVersion,
} from './tables.js';

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint_name' in error &&
    error.constraint_name === constraint
  ) {
    return true;
  }

  return (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    isUniqueViolation(error.cause, constraint)
  );
}

function toPolicy(
  row: typeof privacyPolicyPackageVersion.$inferSelect,
): PrivacyPolicyPackageReference {
  return privacyPolicyPackageReferenceSchema.parse({
    packageId: row.packageId,
    versionId: row.versionId,
    canonicalizationVersion: row.canonicalizationVersion,
    contentDigest: row.contentDigest,
    synthetic: row.synthetic,
  });
}

function toPurpose(
  row: typeof privacyPurposeVersion.$inferSelect,
): PrivacyPurposeVersionReference {
  return privacyPurposeVersionReferenceSchema.parse({
    purposeId: row.purposeId,
    purposeVersionId: row.purposeVersionId,
    policyVersionId: row.policyVersionId,
    allowedOperationKinds: row.allowedOperationKinds,
    allowedCategoryIds: row.allowedCategoryIds,
    evidenceRequired: row.evidenceRequired,
    activationState: row.activationState,
    contentDigest: row.contentDigest,
  });
}

function toProcessor(
  row: typeof privacyProcessorRegistration.$inferSelect,
): PrivacyProcessorDescriptorReference {
  return privacyProcessorDescriptorReferenceSchema.parse({
    processorId: row.processorId,
    inventoryId: row.inventoryId,
    descriptorDigest: row.descriptorDigest,
    inventoryVersionDigest: row.inventoryVersionDigest,
    allowedPurposeIds: row.allowedPurposeIds,
    allowedCategoryIds: row.allowedCategoryIds,
    capabilities: row.capabilities,
    supportsSubjectLookup: row.supportsSubjectLookup,
    codeOwner: row.codeOwner,
    synthetic: row.synthetic,
  });
}

export function createPostgresPrivacyPolicyPackageRepository(
  connection: PostgresConnection,
): PrivacyPolicyPackageRepository {
  return {
    getActive: async (versionId) => {
      const [row] = await connection.db
        .select()
        .from(privacyPolicyPackageVersion)
        .where(eq(privacyPolicyPackageVersion.versionId, versionId))
        .limit(1);
      return row ? toPolicy(row) : null;
    },

    put: async (record): Promise<PrivacyReferencePutResult> => {
      const valid = privacyPolicyPackageReferenceSchema.parse(record);
      try {
        await connection.db.insert(privacyPolicyPackageVersion).values({
          versionId: valid.versionId,
          packageId: valid.packageId,
          canonicalizationVersion: valid.canonicalizationVersion,
          contentDigest: valid.contentDigest,
          synthetic: valid.synthetic,
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_policy_package_version_pkey')) {
          return 'conflict';
        }
        throw error;
      }
    },
  };
}

export function createPostgresPrivacyPurposeRegistry(
  connection: PostgresConnection,
): PrivacyPurposeRegistry {
  return {
    getVersion: async (purposeVersionId) => {
      const [row] = await connection.db
        .select()
        .from(privacyPurposeVersion)
        .where(eq(privacyPurposeVersion.purposeVersionId, purposeVersionId))
        .limit(1);
      return row ? toPurpose(row) : null;
    },

    put: async (record): Promise<PrivacyReferencePutResult> => {
      const valid = canonicalizePrivacyPurposeVersionReference(
        privacyPurposeVersionReferenceSchema.parse(record),
      );
      try {
        await connection.db.insert(privacyPurposeVersion).values({
          purposeVersionId: valid.purposeVersionId,
          purposeId: valid.purposeId,
          policyVersionId: valid.policyVersionId,
          allowedOperationKinds: [...valid.allowedOperationKinds],
          allowedCategoryIds: [...valid.allowedCategoryIds],
          evidenceRequired: valid.evidenceRequired,
          activationState: valid.activationState,
          contentDigest: valid.contentDigest,
        });
        return 'accepted';
      } catch (error) {
        if (
          isUniqueViolation(error, 'privacy_purpose_version_pkey') ||
          isUniqueViolation(error, 'privacy_purpose_version_one_active')
        ) {
          return 'conflict';
        }
        throw error;
      }
    },
  };
}

export function createPostgresPrivacyRuntimeProcessorRegistry(
  connection: PostgresConnection,
): PrivacyRuntimeProcessorRegistry {
  return {
    getDescriptor: async (processorId) => {
      const [row] = await connection.db
        .select()
        .from(privacyProcessorRegistration)
        .where(eq(privacyProcessorRegistration.processorId, processorId))
        .limit(1);
      return row ? toProcessor(row) : null;
    },

    listDescriptors: async () => {
      const rows = await connection.db
        .select()
        .from(privacyProcessorRegistration);
      return rows.map((row) => toProcessor(row));
    },

    put: async (record): Promise<PrivacyReferencePutResult> => {
      const valid = canonicalizePrivacyProcessorDescriptorReference(
        privacyProcessorDescriptorReferenceSchema.parse(record),
      );
      try {
        await connection.db.insert(privacyProcessorRegistration).values({
          processorId: valid.processorId,
          inventoryId: valid.inventoryId,
          descriptorDigest: valid.descriptorDigest,
          inventoryVersionDigest: valid.inventoryVersionDigest,
          allowedPurposeIds: [...valid.allowedPurposeIds],
          allowedCategoryIds: [...valid.allowedCategoryIds],
          capabilities: [...valid.capabilities],
          supportsSubjectLookup: valid.supportsSubjectLookup,
          codeOwner: valid.codeOwner,
          synthetic: valid.synthetic,
        });
        return 'accepted';
      } catch (error) {
        if (isUniqueViolation(error, 'privacy_processor_registration_pkey')) {
          return 'conflict';
        }
        throw error;
      }
    },
  };
}
