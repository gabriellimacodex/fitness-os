export type OnboardingTransitionRecord = {
  aggregate: 'invitation' | 'attempt' | 'role_mapping' | 'operation';
  aggregateId: string;
  previousState: string;
  nextState: string;
  operationId: string;
  reason: string;
  recordedAt: string;
};

/**
 * Persist mandatory append-only transition evidence with the state change.
 */
export interface OnboardingTransitionSink {
  append(record: OnboardingTransitionRecord): Promise<'accepted' | 'conflict'>;
}

/**
 * In-memory append-only sink for synthetic compositions.
 */
export class SyntheticOnboardingTransitionSink implements OnboardingTransitionSink {
  readonly #records: OnboardingTransitionRecord[] = [];

  async append(
    record: OnboardingTransitionRecord,
  ): Promise<'accepted' | 'conflict'> {
    const duplicate = this.#records.some(
      (row) =>
        row.aggregate === record.aggregate &&
        row.aggregateId === record.aggregateId &&
        row.operationId === record.operationId &&
        row.previousState === record.previousState &&
        row.nextState === record.nextState,
    );
    if (duplicate) {
      return 'conflict';
    }
    this.#records.push(record);
    return 'accepted';
  }

  list(): readonly OnboardingTransitionRecord[] {
    return [...this.#records];
  }
}
