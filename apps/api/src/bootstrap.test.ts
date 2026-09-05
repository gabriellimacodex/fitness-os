import { describe, expect, it, vi } from 'vitest';

import {
  bootstrapApi,
  parseCorsAllowedOrigins,
  parsePort,
  readServerConfig,
} from './bootstrap.js';

describe('parsePort', () => {
  it('rejects values that are not integer literals', () => {
    expect(() => parsePort('not-a-port')).toThrow('PORT must be an integer');
    expect(() => parsePort('3001.5')).toThrow('PORT must be an integer');
  });

  it('rejects ports outside the valid TCP range', () => {
    expect(() => parsePort('0')).toThrow('PORT must be between 1 and 65535');
    expect(() => parsePort('65536')).toThrow(
      'PORT must be between 1 and 65535',
    );
  });
});

describe('readServerConfig', () => {
  it('defaults to a loopback host and port 3001', () => {
    expect(readServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3001,
    });
  });
});

describe('parseCorsAllowedOrigins', () => {
  it('defaults to the local web origin', () => {
    expect(parseCorsAllowedOrigins(undefined)).toEqual([
      'http://localhost:3000',
    ]);
  });

  it('trims and deduplicates configured origins', () => {
    expect(
      parseCorsAllowedOrigins(
        ' https://student.example,https://coach.example,https://student.example ',
      ),
    ).toEqual(['https://student.example', 'https://coach.example']);
  });

  it('normalizes equivalent absolute HTTP(S) origins before deduplication', () => {
    expect(
      parseCorsAllowedOrigins(
        'HTTPS://EXAMPLE.COM/,https://example.com:443,http://LOCALHOST:80',
      ),
    ).toEqual(['https://example.com', 'http://localhost']);
  });

  it('rejects empty and non-HTTP absolute origins', () => {
    for (const value of [
      '',
      'https://valid.example,',
      'relative',
      'ftp://host',
      'https://user:secret@host',
      'https://host/path',
      'https://host?query=value',
    ]) {
      expect(() => parseCorsAllowedOrigins(value)).toThrow(
        'CORS_ALLOWED_ORIGINS must contain absolute HTTP(S) origins',
      );
    }
  });
});

describe('bootstrapApi', () => {
  it('uses explicit network config and redacts authorization headers', async () => {
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://192.0.2.10:4321'),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };
    const createApp = vi.fn(() => app);

    await bootstrapApi({
      createApp,
      env: {
        CORS_ALLOWED_ORIGINS: 'https://student.example',
        HOST: '192.0.2.10',
        PORT: '4321',
      },
      runtime,
    });

    expect(createApp).toHaveBeenCalledWith(
      {
        logger: {
          redact: {
            censor: '[REDACTED]',
            paths: [
              'req.headers.authorization',
              "req.headers['proxy-authorization']",
              'req.body.claimSecret',
              'req.body.retryToken',
            ],
          },
        },
      },
      { corsAllowedOrigins: ['https://student.example'] },
    );
    expect(app.listen).toHaveBeenCalledWith({
      host: '192.0.2.10',
      port: 4321,
    });
  });

  it('closes gracefully on SIGTERM', async () => {
    const signalHandlers = new Map<string, () => Promise<void>>();
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn((signal: string, handler: () => Promise<void>) => {
        signalHandlers.set(signal, handler);
      }),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    await bootstrapApi({
      createApp: () => app,
      env: {},
      runtime,
    });
    const handleSigterm = signalHandlers.get('SIGTERM');

    expect(handleSigterm).toBeDefined();
    await handleSigterm?.();
    expect(app.close).toHaveBeenCalledOnce();
  });

  it('closes gracefully on SIGINT', async () => {
    const signalHandlers = new Map<string, () => Promise<void>>();
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn((signal: string, handler: () => Promise<void>) => {
        signalHandlers.set(signal, handler);
      }),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    await bootstrapApi({
      createApp: () => app,
      env: {},
      runtime,
    });
    const handleSigint = signalHandlers.get('SIGINT');

    expect(handleSigint).toBeDefined();
    await handleSigint?.();
    expect(app.close).toHaveBeenCalledOnce();
  });

  it('marks a startup failure as fatal and logs it', async () => {
    const startupError = new Error('bind failed');
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => Promise.reject(startupError)),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    await expect(
      bootstrapApi({ createApp: () => app, env: {}, runtime }),
    ).rejects.toThrow('bind failed');

    expect(runtime.exitCode).toBe(1);
    expect(app.log.error).toHaveBeenCalledWith(
      { err: startupError },
      'API startup failed',
    );
  });

  it('marks app construction failure as fatal', async () => {
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };

    await expect(
      bootstrapApi({
        createApp: () => {
          throw new Error('construction failed');
        },
        env: {},
        runtime,
      }),
    ).rejects.toThrow('construction failed');

    expect(runtime.exitCode).toBe(1);
  });

  it('closes only once when multiple shutdown signals arrive', async () => {
    const signalHandlers = new Map<string, () => Promise<void>>();
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn((signal: string, handler: () => Promise<void>) => {
        signalHandlers.set(signal, handler);
      }),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    await bootstrapApi({ createApp: () => app, env: {}, runtime });
    await signalHandlers.get('SIGTERM')?.();
    await signalHandlers.get('SIGINT')?.();

    expect(app.close).toHaveBeenCalledOnce();
  });

  it('wires a composed privacy platform into the app when configured', async () => {
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };
    const createApp = vi.fn(() => app);
    const privacy = {
      readiness: { evaluate: vi.fn(async () => true as never) },
    };
    const connectionClose = vi.fn(async () => undefined);
    const createPrivacyPlatform = vi.fn(() => ({
      connection: { close: connectionClose, db: {} as never },
      platform: { privacy },
    }));

    await bootstrapApi({
      createApp,
      createPrivacyPlatform,
      env: { PRIVACY_DATABASE_URL: 'postgresql://privacy' },
      runtime,
    });

    expect(createPrivacyPlatform).toHaveBeenCalledWith({
      PRIVACY_DATABASE_URL: 'postgresql://privacy',
    });
    expect(createApp).toHaveBeenCalledWith(
      { logger: expect.any(Object) },
      {
        corsAllowedOrigins: ['http://localhost:3000'],
        privacy,
      },
    );
  });

  it('omits privacy platform composition when it is not configured', async () => {
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: { error: vi.fn(), info: vi.fn() },
    };
    const createApp = vi.fn(() => app);
    const createPrivacyPlatform = vi.fn(() => null);

    await bootstrapApi({ createApp, createPrivacyPlatform, env: {}, runtime });

    expect(createApp).toHaveBeenCalledWith(
      { logger: expect.any(Object) },
      { corsAllowedOrigins: ['http://localhost:3000'] },
    );
  });

  it('closes the composed privacy connection on graceful shutdown', async () => {
    const signalHandlers = new Map<string, () => Promise<void>>();
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn((signal: string, handler: () => Promise<void>) => {
        signalHandlers.set(signal, handler);
      }),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: { error: vi.fn(), info: vi.fn() },
    };
    const connectionClose = vi.fn(async () => undefined);
    const createPrivacyPlatform = vi.fn(() => ({
      connection: { close: connectionClose, db: {} as never },
      platform: {},
    }));

    await bootstrapApi({
      createApp: () => app,
      createPrivacyPlatform,
      env: {},
      runtime,
    });
    await signalHandlers.get('SIGTERM')?.();

    expect(app.close).toHaveBeenCalledOnce();
    expect(connectionClose).toHaveBeenCalledOnce();
  });

  it('marks a privacy connection close failure on shutdown as fatal without leaking a rejection', async () => {
    const closeError = new Error('privacy close failed');
    const signalHandlers = new Map<string, () => Promise<void>>();
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn((signal: string, handler: () => Promise<void>) => {
        signalHandlers.set(signal, handler);
      }),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: { error: vi.fn(), info: vi.fn() },
    };
    const createPrivacyPlatform = vi.fn(() => ({
      connection: {
        close: vi.fn(async () => Promise.reject(closeError)),
        db: {} as never,
      },
      platform: {},
    }));

    await bootstrapApi({
      createApp: () => app,
      createPrivacyPlatform,
      env: {},
      runtime,
    });

    await expect(signalHandlers.get('SIGTERM')?.()).resolves.toBeUndefined();
    expect(runtime.exitCode).toBe(1);
    expect(app.log.error).toHaveBeenCalledWith(
      { err: closeError, signal: 'SIGTERM' },
      'Privacy connection close failed',
    );
  });

  it('closes a composed privacy connection when startup fails and marks the failure fatal', async () => {
    const startupError = new Error('bind failed');
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const app = {
      close: vi.fn(async () => undefined),
      listen: vi.fn(async () => Promise.reject(startupError)),
      log: { error: vi.fn(), info: vi.fn() },
    };
    const connectionClose = vi.fn(async () => undefined);
    const createPrivacyPlatform = vi.fn(() => ({
      connection: { close: connectionClose, db: {} as never },
      platform: {},
    }));

    await expect(
      bootstrapApi({
        createApp: () => app,
        createPrivacyPlatform,
        env: {},
        runtime,
      }),
    ).rejects.toThrow('bind failed');

    expect(runtime.exitCode).toBe(1);
    expect(connectionClose).toHaveBeenCalledOnce();
  });

  it('marks privacy platform composition failure as fatal before creating the app', async () => {
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const compositionError = new Error('PRIVACY_DATABASE_URL invalid');
    const createApp = vi.fn();
    const createPrivacyPlatform = vi.fn(() => {
      throw compositionError;
    });

    await expect(
      bootstrapApi({ createApp, createPrivacyPlatform, env: {}, runtime }),
    ).rejects.toThrow('PRIVACY_DATABASE_URL invalid');

    expect(runtime.exitCode).toBe(1);
    expect(createApp).not.toHaveBeenCalled();
  });

  it('closes a composed privacy connection when app creation fails after composition', async () => {
    const creationError = new Error('invalid CORS_ALLOWED_ORIGINS');
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn(),
    };
    const connectionClose = vi.fn(async () => undefined);
    const createPrivacyPlatform = vi.fn(() => ({
      connection: { close: connectionClose, db: {} as never },
      platform: {},
    }));
    const createApp = vi.fn(() => {
      throw creationError;
    });

    await expect(
      bootstrapApi({ createApp, createPrivacyPlatform, env: {}, runtime }),
    ).rejects.toThrow('invalid CORS_ALLOWED_ORIGINS');

    expect(runtime.exitCode).toBe(1);
    expect(connectionClose).toHaveBeenCalledOnce();
  });

  it('marks a shutdown failure as fatal without leaking a rejection', async () => {
    const shutdownError = new Error('close failed');
    const signalHandlers = new Map<string, () => Promise<void>>();
    const runtime = {
      exitCode: undefined as number | undefined,
      off: vi.fn(),
      once: vi.fn((signal: string, handler: () => Promise<void>) => {
        signalHandlers.set(signal, handler);
      }),
    };
    const app = {
      close: vi.fn(async () => Promise.reject(shutdownError)),
      listen: vi.fn(async () => 'http://127.0.0.1:3001'),
      log: {
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    await bootstrapApi({ createApp: () => app, env: {}, runtime });
    await expect(signalHandlers.get('SIGTERM')?.()).resolves.toBeUndefined();

    expect(runtime.exitCode).toBe(1);
    expect(app.log.error).toHaveBeenCalledWith(
      { err: shutdownError, signal: 'SIGTERM' },
      'API shutdown failed',
    );
  });
});
