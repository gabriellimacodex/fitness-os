import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  privacyCoveredExpectedProcessorInventorySchema,
  type PrivacyExpectedProcessorInventory,
} from './privacy-governance.js';

/**
 * Loads and validates the reviewed synthetic processor-inventory fixture
 * (`fixtures/privacy/processor-inventory.v1.json`) that this package ships
 * alongside its executable privacy-governance contracts. The fixture is the
 * one PRD 21 Gate A evidence (#210) confirms maps every declared governance
 * record family exactly once.
 *
 * This module is exported through the dedicated `@fitness-os/schemas/privacy-fixtures`
 * package entry point instead of the package's main `.` export, and is never
 * re-exported from `index.ts`. It performs a Node filesystem read, which must
 * never reach `apps/web`'s browser bundle of `@fitness-os/schemas` — that
 * import only ever resolves the main entry point.
 */
export function loadReviewedSyntheticPrivacyExpectedProcessorInventory(): PrivacyExpectedProcessorInventory {
  const fixturePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../fixtures/privacy/processor-inventory.v1.json',
  );
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;
  return privacyCoveredExpectedProcessorInventorySchema.parse(raw);
}
