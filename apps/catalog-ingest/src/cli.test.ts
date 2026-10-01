import { resolve } from 'node:path';

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn<(path: string, encoding: string) => Promise<string>>(),
  createCatalogGitInspection: vi.fn(),
  verifyCatalogArtifact: vi.fn(),
  createManifestIngestionCommand: vi.fn(),
  createPostgresConnection: vi.fn(),
  createExerciseCatalogCuration: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
}));

vi.mock('./git-inspection.js', () => ({
  createCatalogGitInspection: mocks.createCatalogGitInspection,
}));

vi.mock('./verification.js', () => ({
  verifyCatalogArtifact: mocks.verifyCatalogArtifact,
}));

vi.mock('@fitness-os/domain', () => ({
  createManifestIngestionCommand: mocks.createManifestIngestionCommand,
}));

vi.mock('@fitness-os/database', () => ({
  createPostgresConnection: mocks.createPostgresConnection,
  createExerciseCatalogCuration: mocks.createExerciseCatalogCuration,
}));

import { runCatalogIngestCli } from './cli.js';

const VALID_SECRET = 'a'.repeat(64);
const VALID_ARGS = [
  '--database-url',
  'postgres://example/test',
  '--ledger-key-id',
  'ledger-key-1',
  '--ledger-secret-hex',
  VALID_SECRET,
];

const fakeGit = { resolveHead: vi.fn(async () => 'f'.repeat(40)) };
const fakeManifest = { manifestId: 'fitness-os-pilot-catalog' };
const fakeIngestCommand = { operation: { key: 'k' }, manifest: fakeManifest };
const ingestManifestMock = vi.fn();
const connectionCloseMock = vi.fn(async () => undefined);
const fakeConnection = { close: connectionCloseMock };

function setHappyPathDefaults(): void {
  mocks.readFile.mockImplementation(async (path: string) =>
    path.includes('review') ? '{"review":true}' : '{"manifest":true}',
  );
  mocks.createCatalogGitInspection.mockReturnValue(fakeGit);
  mocks.verifyCatalogArtifact.mockResolvedValue({ manifest: fakeManifest });
  mocks.createManifestIngestionCommand.mockReturnValue({
    status: 'ready',
    command: fakeIngestCommand,
  });
  mocks.createPostgresConnection.mockReturnValue(fakeConnection);
  ingestManifestMock.mockResolvedValue({
    status: 'manifest_ingested',
    replayed: false,
    manifestId: 'fitness-os-pilot-catalog',
    exerciseCount: 1,
    taxonomyTermCount: 2,
  });
  mocks.createExerciseCatalogCuration.mockReturnValue({
    ingestManifest: ingestManifestMock,
  });
}

describe('runCatalogIngestCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setHappyPathDefaults();
  });

  it('exits with usage when required configuration is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('process.exit called');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // swallow usage output in the test log
    });

    await expect(runCatalogIngestCli([], {})).rejects.toThrow(
      'process.exit called',
    );

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(mocks.createPostgresConnection).not.toHaveBeenCalled();
  });

  it('rejects a ledger secret that is not exactly 64 hex characters', async () => {
    await expect(
      runCatalogIngestCli(
        [
          '--database-url',
          'postgres://example/test',
          '--ledger-key-id',
          'ledger-key-1',
          '--ledger-secret-hex',
          'not-hex',
        ],
        {},
      ),
    ).rejects.toThrow('ledger secret must be 64 hex characters');

    expect(mocks.createPostgresConnection).not.toHaveBeenCalled();
  });

  it('falls back to CATALOG_* environment variables when flags are absent', async () => {
    await runCatalogIngestCli([], {
      CATALOG_DATABASE_URL: 'postgres://from-env/test',
      CATALOG_LEDGER_KEY_ID: 'env-key',
      CATALOG_LEDGER_SECRET_HEX: VALID_SECRET,
    });

    expect(mocks.createPostgresConnection).toHaveBeenCalledWith(
      'postgres://from-env/test',
    );
    expect(mocks.createExerciseCatalogCuration).toHaveBeenCalledWith(
      fakeConnection,
      {
        keys: [
          {
            keyId: 'env-key',
            secret: Buffer.from(VALID_SECRET, 'hex'),
            status: 'active',
          },
        ],
      },
    );
  });

  it('prefers an explicit CLI flag over the equivalent environment variable', async () => {
    await runCatalogIngestCli(VALID_ARGS, {
      CATALOG_DATABASE_URL: 'postgres://from-env/test',
      CATALOG_LEDGER_KEY_ID: 'env-key',
      CATALOG_LEDGER_SECRET_HEX: 'b'.repeat(64),
    });

    expect(mocks.createPostgresConnection).toHaveBeenCalledWith(
      'postgres://example/test',
    );
  });

  it('ingests the manifest end-to-end and closes the connection on success', async () => {
    const result = await runCatalogIngestCli(VALID_ARGS, {});

    expect(result).toEqual({
      status: 'manifest_ingested',
      replayed: false,
      manifestId: 'fitness-os-pilot-catalog',
      exerciseCount: 1,
      taxonomyTermCount: 2,
    });
    expect(mocks.createManifestIngestionCommand).toHaveBeenCalledWith(
      expect.objectContaining({ manifest: fakeManifest }),
    );
    expect(ingestManifestMock).toHaveBeenCalledWith(fakeIngestCommand);
    expect(connectionCloseMock).toHaveBeenCalledOnce();
  });

  it('defaults the operation ID to a fresh random UUID when none is supplied', async () => {
    await runCatalogIngestCli(VALID_ARGS, {});

    const [[input]] = mocks.createManifestIngestionCommand.mock.calls as [
      [{ operationId: string }],
    ];
    expect(input.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('honors an explicit --operation-id over a generated one', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';

    await runCatalogIngestCli(
      [...VALID_ARGS, '--operation-id', operationId],
      {},
    );

    expect(mocks.createManifestIngestionCommand).toHaveBeenCalledWith(
      expect.objectContaining({ operationId }),
    );
  });

  it('reads custom --manifest/--review paths but still verifies against the canonical repo path', async () => {
    await runCatalogIngestCli(
      [
        ...VALID_ARGS,
        '--manifest',
        'tmp/manifest.json',
        '--review',
        'tmp/review.json',
      ],
      {},
    );

    expect(mocks.readFile).toHaveBeenCalledWith(
      resolve('tmp/manifest.json'),
      'utf8',
    );
    expect(mocks.readFile).toHaveBeenCalledWith(
      resolve('tmp/review.json'),
      'utf8',
    );
    expect(mocks.verifyCatalogArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestPath: 'catalog/catalog-manifest.v1.json',
      }),
      fakeGit,
    );
  });

  it('throws without opening a database connection when the ingestion command is invalid', async () => {
    mocks.createManifestIngestionCommand.mockReturnValue({
      status: 'invalid',
      violations: ['invalid_manifest'],
    });

    await expect(runCatalogIngestCli(VALID_ARGS, {})).rejects.toThrow(
      'Invalid ingest command: invalid_manifest',
    );

    expect(mocks.createPostgresConnection).not.toHaveBeenCalled();
  });

  it('still closes the connection when the repository reports a non-ingested result', async () => {
    ingestManifestMock.mockResolvedValue({
      status: 'operation_input_mismatch',
    });

    await expect(runCatalogIngestCli(VALID_ARGS, {})).rejects.toThrow(
      'Ingest failed: operation_input_mismatch',
    );

    expect(connectionCloseMock).toHaveBeenCalledOnce();
  });

  it('still closes the connection when the repository call itself rejects', async () => {
    ingestManifestMock.mockRejectedValue(new Error('connection reset'));

    await expect(runCatalogIngestCli(VALID_ARGS, {})).rejects.toThrow(
      'connection reset',
    );

    expect(connectionCloseMock).toHaveBeenCalledOnce();
  });
});
