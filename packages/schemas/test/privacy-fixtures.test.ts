import { describe, expect, it } from 'vitest';

import { loadReviewedSyntheticPrivacyExpectedProcessorInventory } from '../src/privacy-fixtures.js';
import { privacyGovernanceRecordFamilySchema } from '../src/privacy-governance.js';

describe('loadReviewedSyntheticPrivacyExpectedProcessorInventory', () => {
  it('loads the packaged fixture and satisfies reviewed coverage', () => {
    const inventory = loadReviewedSyntheticPrivacyExpectedProcessorInventory();

    expect(inventory.schemaVersion).toBe('privacy.processor-inventory.v1');
    expect(inventory.processors).toHaveLength(1);
    expect(inventory.processors[0]?.synthetic).toBe(true);
    expect(inventory.processors[0]?.environmentApplicability).toBe(
      'synthetic_only',
    );

    const mappedFamilies = inventory.processors[0]?.recordFamilies.map(
      ({ family }) => family,
    );
    expect([...(mappedFamilies ?? [])].sort()).toEqual(
      [...privacyGovernanceRecordFamilySchema.options].sort(),
    );
  });

  it('returns a fresh object on every call rather than a shared mutable singleton', () => {
    const first = loadReviewedSyntheticPrivacyExpectedProcessorInventory();
    const second = loadReviewedSyntheticPrivacyExpectedProcessorInventory();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
