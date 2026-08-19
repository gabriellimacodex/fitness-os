import type { PrincipalRoleMappingId } from '@fitness-os/schemas';

import type { ProposedRole } from './claim.js';

export type PrincipalRoleMappingRecord = {
  createdAt: string;
  mappingId: PrincipalRoleMappingId;
  principalKey: string;
  role: ProposedRole;
};

export type PrincipalRoleMappingPutResult =
  | { status: 'accepted'; mapping: PrincipalRoleMappingRecord }
  | { status: 'replay'; mapping: PrincipalRoleMappingRecord }
  | { status: 'conflict'; mapping: PrincipalRoleMappingRecord };

/**
 * Read exact role mappings and enforce role uniqueness per principal.
 * Does not infer authorization from mapping presence alone.
 */
export interface PrincipalRoleMappingRepository {
  get(mappingId: string): Promise<PrincipalRoleMappingRecord | null>;
  listByPrincipal(
    principalKey: string,
  ): Promise<readonly PrincipalRoleMappingRecord[]>;
  put(
    record: PrincipalRoleMappingRecord,
  ): Promise<PrincipalRoleMappingPutResult>;
}
