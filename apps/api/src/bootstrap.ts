import type { FastifyServerOptions } from 'fastify';

import { buildApp, type PlatformOptions } from './app.js';
import {
  createCatalogPlatformFromEnv,
  type CatalogPlatformHandles,
} from './catalog-platform.js';

const DEFAULT_PORT = '3001';

// Loopback is the safe local default; deployment must opt in to external binding.
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_CORS_ALLOWED_ORIGIN = 'http://localhost:3000';

export interface ServerConfig {
  host: string;
  port: number;
}

interface BootstrapApp {
  close(): Promise<void>;
  listen(options: ServerConfig): Promise<unknown>;
  log: {
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
  };
}

interface BootstrapDependencies {
  createApp?: (
    options: FastifyServerOptions,
    platform: PlatformOptions,
  ) => BootstrapApp;
  /**
   * Composes the real Postgres-backed exercise catalog reader and readiness
   * check from environment configuration. Defaults to
   * `createCatalogPlatformFromEnv`, which returns `null` (no catalog
   * composition, matching prior behavior) unless `CATALOG_DATABASE_URL` and
   * the ledger key-ring env vars are configured. Injectable so tests never
   * need a real database connection.
   */
  createCatalogPlatform?: (
    env: NodeJS.ProcessEnv,
  ) => CatalogPlatformHandles | null;
  env?: NodeJS.ProcessEnv;
  runtime?: RuntimeProcess;
}

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

interface RuntimeProcess {
  exitCode: number | undefined;
  off(signal: ShutdownSignal, handler: () => void): unknown;
  once(signal: ShutdownSignal, handler: () => void): unknown;
}

const LOGGER_OPTIONS: FastifyServerOptions['logger'] = {
  redact: {
    censor: '[REDACTED]',
    paths: [
      'req.headers.authorization',
      "req.headers['proxy-authorization']",
      'req.body.claimSecret',
      'req.body.retryToken',
    ],
  },
};

export function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be an integer');
  }

  const port = Number(value);

  if (port < 1 || port > 65_535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return port;
}

export function parseCorsAllowedOrigins(value: string | undefined): string[] {
  const normalizedOrigins = (value ?? DEFAULT_CORS_ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .map((origin) => {
      let parsed: URL;

      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(
          'CORS_ALLOWED_ORIGINS must contain absolute HTTP(S) origins',
        );
      }

      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username !== '' ||
        parsed.password !== '' ||
        parsed.pathname !== '/' ||
        parsed.search !== '' ||
        parsed.hash !== ''
      ) {
        throw new Error(
          'CORS_ALLOWED_ORIGINS must contain absolute HTTP(S) origins',
        );
      }

      return parsed.origin;
    });

  return [...new Set(normalizedOrigins)];
}

export function readServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  return {
    host: env.HOST ?? DEFAULT_HOST,
    port: parsePort(env.PORT ?? DEFAULT_PORT),
  };
}

export async function bootstrapApi(
  dependencies: BootstrapDependencies = {},
): Promise<BootstrapApp> {
  const createApp = dependencies.createApp ?? buildApp;
  const createCatalogPlatform =
    dependencies.createCatalogPlatform ?? createCatalogPlatformFromEnv;
  const env = dependencies.env ?? process.env;
  const runtime = dependencies.runtime ?? process;
  let app: BootstrapApp;
  let catalogPlatform: CatalogPlatformHandles | null = null;

  try {
    catalogPlatform = createCatalogPlatform(env);
    app = createApp(
      { logger: LOGGER_OPTIONS },
      {
        corsAllowedOrigins: parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS),
        ...catalogPlatform?.platform,
      },
    );
  } catch (error) {
    runtime.exitCode = 1;
    throw error;
  }

  try {
    await app.listen(readServerConfig(env));
  } catch (error) {
    runtime.exitCode = 1;
    app.log.error({ err: error }, 'API startup failed');
    if (catalogPlatform !== null) {
      await catalogPlatform.connection.close().catch((closeError: unknown) => {
        app.log.error(
          { err: closeError },
          'Catalog connection close failed after startup failure',
        );
      });
    }
    throw error;
  }

  let shuttingDown = false;
  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    runtime.off('SIGTERM', handleSigterm);
    runtime.off('SIGINT', handleSigint);
    app.log.info({ signal }, 'API shutdown started');
    try {
      await app.close();
    } catch (error) {
      runtime.exitCode = 1;
      app.log.error({ err: error, signal }, 'API shutdown failed');
    }
    if (catalogPlatform !== null) {
      try {
        await catalogPlatform.connection.close();
      } catch (error) {
        runtime.exitCode = 1;
        app.log.error(
          { err: error, signal },
          'Catalog connection close failed',
        );
      }
    }
  };
  const handleSigterm = (): Promise<void> => shutdown('SIGTERM');
  const handleSigint = (): Promise<void> => shutdown('SIGINT');

  runtime.once('SIGTERM', handleSigterm);
  runtime.once('SIGINT', handleSigint);

  return app;
}
