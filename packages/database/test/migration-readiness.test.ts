import { describe, expect, it } from 'vitest';

import { journalContainsRequiredHashes } from '../src/catalog/migration-readiness.js';

describe('journal subset readiness', () => {
  it('passes when every required hash is present among later entries', () => {
    expect(
      journalContainsRequiredHashes(
        [
          { hash: 'required-0000' },
          { hash: 'required-0001' },
          { hash: 'later-0002' },
        ],
        ['required-0000', 'required-0001'],
      ),
    ).toEqual({ ready: true });
  });

  it('fails only on missing required hashes, not on extra journal rows', () => {
    expect(
      journalContainsRequiredHashes(
        [{ hash: 'required-0000' }, { hash: 'later-0002' }],
        ['required-0000', 'required-0001'],
      ),
    ).toEqual({
      missingHashes: ['required-0001'],
      ready: false,
    });
  });
});
