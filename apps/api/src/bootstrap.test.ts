import { describe, expect, it, vi } from 'vitest';

import {
  bootstrapApi,
  parseCorsAllowedOrigins,
  parsePort,
  readServerConfig,
} from './bootstrap.js';
import type { PrivacyPlatformHandles } from './privacy/platform.js';

const LOGGER_OPTIONS_FOR_TESTS = {
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

  it('omits privacy platform options when no privacy platform is composed', async () => {
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
    const createPrivacyPlatform = vi.fn(() => null);

    await bootstrapApi({ createApp, createPrivacyPlatform, env: {}, runtime });

    expect(createPrivacyPlatform).toHaveBeenCalledWith({});
    expect(createApp).toHaveBeenCalledWith(
      { logger: LOGGER_OPTIONS_FOR_TESTS },
      { corsAllowedOrigins: ['http://localhost:3000'] },
    );
  });

  it('wires a composed privacy platform into app options and closes its connection on shutdown', async () => {
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
    const createApp = vi.fn(() => app);
    const privacyOptions = { audit: 'fake-audit-persistence' };
    const closeConnection = vi.fn(async () => undefined);
    const fakePrivacyPlatform = {
      connection: { close: closeConnection },
      platform: { privacy: privacyOptions },
    } as unknown as PrivacyPlatformHandles;
    const createPrivacyPlatform = vi.fn(() => fakePrivacyPlatform);

    await bootstrapApi({
      createApp,
      createPrivacyPlatform,
      env: { PRIVACY_DATABASE_URL: 'postgresql://user:pass@127.0.0.1:1/db' },
      runtime,
    });

    expect(createApp).toHaveBeenCalledWith(
      { logger: LOGGER_OPTIONS_FOR_TESTS },
      {
        allowSyntheticPrivacy: true,
        corsAllowedOrigins: ['http://localhost:3000'],
        privacy: privacyOptions,
      },
    );

    await signalHandlers.get('SIGTERM')?.();

    expect(app.close).toHaveBeenCalledOnce();
    expect(closeConnection).toHaveBeenCalledOnce();
  });

  it('does not attempt to close a privacy platform connection when none was composed', async () => {
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
      createPrivacyPlatform: () => null,
      env: {},
      runtime,
    });
    await signalHandlers.get('SIGTERM')?.();

    expect(app.close).toHaveBeenCalledOnce();
  });
});
