export type IdentitySessionRecord = {
  sessionId: string;
  principalKey: string;
  expiresAt: string;
  createdAt: string;
};

export type IdentitySessionStorePutResult = 'accepted' | 'conflict';

/**
 * Persist/rotate only protected opaque authorization/session state behind the
 * adapter; expose no provider token or profile.
 */
export interface IdentitySessionStore {
  get(sessionId: string): Promise<IdentitySessionRecord | null>;
  put(record: IdentitySessionRecord): Promise<IdentitySessionStorePutResult>;
  revoke(sessionId: string): Promise<'accepted' | 'missing'>;
}

/**
 * Synthetic session store for disposable compositions.
 */
export class SyntheticIdentitySessionStore implements IdentitySessionStore {
  readonly #byId = new Map<string, IdentitySessionRecord>();

  async get(sessionId: string): Promise<IdentitySessionRecord | null> {
    return this.#byId.get(sessionId) ?? null;
  }

  async put(
    record: IdentitySessionRecord,
  ): Promise<IdentitySessionStorePutResult> {
    if (this.#byId.has(record.sessionId)) {
      return 'conflict';
    }
    this.#byId.set(record.sessionId, record);
    return 'accepted';
  }

  async revoke(sessionId: string): Promise<'accepted' | 'missing'> {
    if (!this.#byId.has(sessionId)) {
      return 'missing';
    }
    this.#byId.delete(sessionId);
    return 'accepted';
  }
}
