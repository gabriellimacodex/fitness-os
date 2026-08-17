import { movementCatalog } from './catalog.js';

export {
  createMovementCatalog,
  movementCatalog,
  MovementCatalogError,
  type MovementCatalog,
  type MovementCatalogSource,
  type MovementLookupResult,
} from './catalog.js';
export {
  canonicalizeMovementDetail,
  cloneMovementDetail,
  digestMovementDetail,
} from './canonical.js';
export {
  assertValidManifestRecord,
  deriveManifestState,
  MOVEMENT_MANIFEST_ACTIONS,
  type MovementManifestAction,
  type MovementManifestRecord,
} from './manifest.js';
export {
  assertUniqueNonces,
  createSignedReviewRecord,
  createTestReviewAuthority,
  fingerprintPublicKey,
  INTENDED_READER_RUBRIC,
  MOVEMENT_SAFETY_RUBRIC,
  productionReviewAuthorityFromConfig,
  ReviewVerificationError,
  verifyReviewRecord,
  type MovementReviewRecord,
  type ReviewAuthority,
  type RoleApprovalReceipt,
} from './review-record.js';

export function listMovements() {
  return movementCatalog.listMovements();
}

export function getMovementById(movementId: string) {
  return movementCatalog.getMovementById(movementId);
}
