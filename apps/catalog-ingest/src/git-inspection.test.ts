import { describe, expect, it, vi } from 'vitest';

import {
  createCatalogGitInspection,
  type CatalogGitCommandRunner,
} from './git-inspection.js';

describe('createCatalogGitInspection', () => {
  it('uses argument-only git calls for cleanliness, HEAD, ancestry, and source content', async () => {
    const run: CatalogGitCommandRunner = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: `${'a'.repeat(40)}\n` })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{"reviewed":true}\n' });
    const inspection = createCatalogGitInspection('/repo', run);

    await expect(inspection.isClean()).resolves.toBe(true);
    await expect(inspection.resolveHead()).resolves.toBe('a'.repeat(40));
    await expect(
      inspection.isAncestor('b'.repeat(40), 'a'.repeat(40)),
    ).resolves.toBe(true);
    await expect(
      inspection.readTextAtCommit(
        'b'.repeat(40),
        'catalog/catalog-manifest.v1.json',
      ),
    ).resolves.toBe('{"reviewed":true}\n');

    expect(run).toHaveBeenNthCalledWith(
      1,
      ['status', '--porcelain=v1', '--untracked-files=all'],
      '/repo',
    );
    expect(run).toHaveBeenNthCalledWith(2, ['rev-parse', 'HEAD'], '/repo');
    expect(run).toHaveBeenNthCalledWith(
      3,
      ['merge-base', '--is-ancestor', 'b'.repeat(40), 'a'.repeat(40)],
      '/repo',
    );
    expect(run).toHaveBeenNthCalledWith(
      4,
      ['show', `${'b'.repeat(40)}:catalog/catalog-manifest.v1.json`],
      '/repo',
    );
  });

  it('distinguishes expected negative git results from command failures', async () => {
    const run: CatalogGitCommandRunner = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: ' M tracked-file\n' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 128, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 2, stdout: '' });
    const inspection = createCatalogGitInspection('/repo', run);

    await expect(inspection.isClean()).resolves.toBe(false);
    await expect(
      inspection.isAncestor('b'.repeat(40), 'a'.repeat(40)),
    ).resolves.toBe(false);
    await expect(
      inspection.readTextAtCommit(
        'b'.repeat(40),
        'catalog/catalog-manifest.v1.json',
      ),
    ).resolves.toBeNull();
    await expect(inspection.resolveHead()).rejects.toThrow(
      'Git inspection failed.',
    );
  });
});
