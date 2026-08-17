import { spawn } from 'node:child_process';

import type { CatalogGitInspection } from './verification.js';

const MAX_GIT_OUTPUT_BYTES = 5 * 1024 * 1024;

export interface CatalogGitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
}

export type CatalogGitCommandRunner = (
  args: readonly string[],
  repositoryRoot: string,
) => Promise<CatalogGitCommandResult>;

function gitFailure(): Error {
  return new Error('Git inspection failed.');
}

const runGitCommand: CatalogGitCommandRunner = (args, repositoryRoot) =>
  new Promise((resolve, reject) => {
    const child = spawn('git', [...args], {
      cwd: repositoryRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_GIT_OUTPUT_BYTES) {
        settled = true;
        child.kill('SIGKILL');
        reject(gitFailure());
        return;
      }
      output.push(chunk);
    });
    child.once('error', () => {
      if (!settled) {
        settled = true;
        reject(gitFailure());
      }
    });
    child.once('close', (code) => {
      if (!settled) {
        settled = true;
        resolve({
          exitCode: typeof code === 'number' ? code : 2,
          stdout: Buffer.concat(output).toString('utf8'),
        });
      }
    });
  });

export function createCatalogGitInspection(
  repositoryRoot: string,
  run: CatalogGitCommandRunner = runGitCommand,
): CatalogGitInspection {
  return {
    isClean: async () => {
      const result = await run(
        ['status', '--porcelain=v1', '--untracked-files=all'],
        repositoryRoot,
      );
      if (result.exitCode !== 0) throw gitFailure();
      return result.stdout === '';
    },
    resolveHead: async () => {
      const result = await run(['rev-parse', 'HEAD'], repositoryRoot);
      if (result.exitCode !== 0) throw gitFailure();
      return result.stdout.trim();
    },
    isAncestor: async (ancestor, descendant) => {
      const result = await run(
        ['merge-base', '--is-ancestor', ancestor, descendant],
        repositoryRoot,
      );
      if (result.exitCode === 0) return true;
      if (result.exitCode === 1) return false;
      throw gitFailure();
    },
    readTextAtCommit: async (commit, path) => {
      const result = await run(['show', `${commit}:${path}`], repositoryRoot);
      if (result.exitCode === 0) return result.stdout;
      if (result.exitCode === 128) return null;
      throw gitFailure();
    },
  };
}
