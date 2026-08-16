import type { FastifyServerOptions } from 'fastify';

import { buildApp } from './app.js';

const DEFAULT_PORT = '3001';

// Loopback is the safe local default; deployment must opt in to external binding.
const DEFAULT_HOST = '127.0.0.1';

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
  createApp?: (options: FastifyServerOptions) => BootstrapApp;
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
  const runtime = dependencies.runtime ?? process;
  let app: BootstrapApp;

  try {
    app = createApp({ logger: LOGGER_OPTIONS });
  } catch (error) {
    runtime.exitCode = 1;
    throw error;
  }

  try {
    await app.listen(readServerConfig(dependencies.env ?? process.env));
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
