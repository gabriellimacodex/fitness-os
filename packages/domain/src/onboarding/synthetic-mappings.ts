import type {
  PrincipalRoleMappingPutResult,
  PrincipalRoleMappingRecord,
  PrincipalRoleMappingRepository,
} from './ports.js';

export class SyntheticPrincipalRoleMappingRepository implements PrincipalRoleMappingRepository {
  readonly #byId = new Map<string, PrincipalRoleMappingRecord>();
  readonly #byPrincipalRole = new Map<string, string>();

  async get(mappingId: string): Promise<PrincipalRoleMappingRecord | null> {
    return this.#byId.get(mappingId) ?? null;
  }

  async listByPrincipal(
    principalKey: string,
  ): Promise<readonly PrincipalRoleMappingRecord[]> {
    return [...this.#byId.values()].filter(
      (row) => row.principalKey === principalKey,
    );
  }

  async put(
    record: PrincipalRoleMappingRecord,
  ): Promise<PrincipalRoleMappingPutResult> {
    const key = `${record.principalKey}:${record.role}`;
    const existingId = this.#byPrincipalRole.get(key);
    if (existingId !== undefined) {
      const existing = this.#byId.get(existingId);
      if (existing === undefined) {
        throw new Error('synthetic role mapping index corrupt');
      }
      if (
        existing.mappingId === record.mappingId &&
        existing.principalKey === record.principalKey &&
        existing.role === record.role
      ) {
        return { mapping: existing, status: 'replay' };
      }
      return { mapping: existing, status: 'conflict' };
    }

    const byId = this.#byId.get(record.mappingId);
    if (byId !== undefined) {
      // A prior accepted put() always sets #byPrincipalRole for its own
      // principalKey/role in the same step, so if byId's principalKey/role
      // matched record's, the existingId lookup above would already have
      // returned. Reaching here always means mappingId collides with a
      // record scoped to a different principal or role.
      return { mapping: byId, status: 'conflict' };
    }

    this.#byId.set(record.mappingId, record);
    this.#byPrincipalRole.set(key, record.mappingId);
    return { mapping: record, status: 'accepted' };
  }
}
