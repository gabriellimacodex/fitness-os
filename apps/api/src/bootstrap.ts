import type { FastifyServerOptions } from 'fastify';

import { buildApp, type PlatformOptions } from './app.js';

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
    paths: ['req.headers.authorization', "req.headers['proxy-authorization']"],
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
  const origins = [
    ...new Set(
      (value ?? DEFAULT_CORS_ALLOWED_ORIGIN)
        .split(',')
        .map((origin) => origin.trim()),
    ),
  ];

  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin
      ) {
        throw new Error('invalid origin');
      }
    } catch {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must contain absolute HTTP(S) origins',
      );
    }
  }

  return origins;
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
  const env = dependencies.env ?? process.env;
  const runtime = dependencies.runtime ?? process;
  let app: BootstrapApp;

  try {
    app = createApp(
      { logger: LOGGER_OPTIONS },
      { corsAllowedOrigins: parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS) },
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
  };
  const handleSigterm = (): Promise<void> => shutdown('SIGTERM');
  const handleSigint = (): Promise<void> => shutdown('SIGINT');

  runtime.once('SIGTERM', handleSigterm);
  runtime.once('SIGINT', handleSigint);

  return app;
}
