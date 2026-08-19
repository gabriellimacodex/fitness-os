import type {
  OnboardingOperationPutResult,
  OnboardingOperationRecord,
  OnboardingOperationRepository,
} from './ports.js';

export class SyntheticOnboardingOperationRepository implements OnboardingOperationRepository {
  readonly #byBinding = new Map<string, OnboardingOperationRecord>();
  readonly #byId = new Map<string, OnboardingOperationRecord>();

  async getByBindingKey(
    bindingKey: string,
  ): Promise<OnboardingOperationRecord | null> {
    return this.#byBinding.get(bindingKey) ?? null;
  }

  async getByOperationId(
    operationId: string,
  ): Promise<OnboardingOperationRecord | null> {
    return this.#byId.get(operationId) ?? null;
  }

  async put(
    record: OnboardingOperationRecord,
  ): Promise<OnboardingOperationPutResult> {
    const existing = this.#byBinding.get(record.bindingKey);
    if (existing !== undefined) {
      if (existing.digest === record.digest) {
        return { operation: existing, status: 'replay' };
      }
      return { operation: existing, status: 'conflict' };
    }
    const byId = this.#byId.get(record.operationId);
    if (byId !== undefined) {
      if (byId.digest === record.digest) {
        return { operation: byId, status: 'replay' };
      }
      return { operation: byId, status: 'conflict' };
    }
    this.#byBinding.set(record.bindingKey, record);
    this.#byId.set(record.operationId, record);
    return { operation: record, status: 'accepted' };
  }
}
