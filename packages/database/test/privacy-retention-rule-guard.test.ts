import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('privacy retention-rule append-only migration', () => {
  it('adds the mutation guard and least-privilege ordinary-role grants forward-only', () => {
    const migration = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../drizzle/0019_prd21_privacy_retention_rule_guard.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      'CREATE TRIGGER privacy_retention_rule_append_only_guard',
    );
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain(
      'EXECUTE FUNCTION privacy_reject_append_only_mutation()',
    );
    expect(migration).toContain(
      'REVOKE ALL ON TABLE "privacy_retention_rule" FROM fitness_os_privacy_ordinary',
    );
    expect(migration).toContain(
      'GRANT SELECT, INSERT ON TABLE "privacy_retention_rule" TO fitness_os_privacy_ordinary',
    );
  });
});
