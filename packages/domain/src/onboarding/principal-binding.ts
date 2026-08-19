export type PrincipalBindingRecord = {
  bindingId: string;
  principalKey: string;
  createdAt: string;
};

export type PrincipalBindingResolveResult =
  | { status: 'resolved'; binding: PrincipalBindingRecord }
  | { status: 'established'; binding: PrincipalBindingRecord }
  | {
      status: 'denied';
      reason: 'ambiguous' | 'synthetic_in_production' | 'missing';
    };

/**
 * Resolve candidates to one logical binding, atomically establish aliases,
 * enforce rotation epoch, and fail on ambiguity.
 */
export interface PrincipalBindingRepository {
  resolveOrEstablish(input: {
    principalKey: string;
    productionMode: boolean;
    nowUtcMs: string;
  }): Promise<PrincipalBindingResolveResult>;
  getByPrincipalKey(
    principalKey: string,
  ): Promise<PrincipalBindingRecord | null>;
}

/**
 * Synthetic binding repository for disposable compositions.
 */
export class SyntheticPrincipalBindingRepository implements PrincipalBindingRepository {
  readonly #byPrincipal = new Map<string, PrincipalBindingRecord>();

  async getByPrincipalKey(
    principalKey: string,
  ): Promise<PrincipalBindingRecord | null> {
    return this.#byPrincipal.get(principalKey) ?? null;
  }

  async resolveOrEstablish(input: {
    principalKey: string;
    productionMode: boolean;
    nowUtcMs: string;
  }): Promise<PrincipalBindingResolveResult> {
    if (input.productionMode) {
      return { reason: 'synthetic_in_production', status: 'denied' };
    }
    if (input.principalKey.trim() === '') {
      return { reason: 'missing', status: 'denied' };
    }
    const existing = this.#byPrincipal.get(input.principalKey);
    if (existing !== undefined) {
      return { binding: existing, status: 'resolved' };
    }
    const binding: PrincipalBindingRecord = {
      bindingId: `synthetic-binding:${input.principalKey}`,
      createdAt: input.nowUtcMs,
      principalKey: input.principalKey,
    };
    this.#byPrincipal.set(input.principalKey, binding);
    return { binding, status: 'established' };
  }
}
