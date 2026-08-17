import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
  type ApiErrorCode,
} from '@fitness-os/schemas';

export class ApiClientError extends Error {
  override readonly name = 'ApiClientError';

  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    readonly requestId: string,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
  }
}

export class ApiProtocolError extends Error {
  override readonly name = 'ApiProtocolError';

  constructor() {
    super('API response did not match the expected protocol.');
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiProtocolError();
  }
}

function throwApiError(response: Response, payload: unknown): never {
  const apiError = apiErrorResponseSchema.safeParse(payload);

  if (!apiError.success) {
    throw new ApiProtocolError();
  }

  const { error } = apiError.data;

  throw new ApiClientError(
    error.code,
    response.status,
    error.requestId,
    error.message,
  );
}

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
};

export function createApiClient({
  baseUrl,
  fetch: fetchImplementation = globalThis.fetch,
}: ApiClientOptions) {
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new TypeError('API base URL must be an absolute HTTP(S) URL.');
  }

  if (
    parsedBaseUrl.protocol !== 'http:' &&
    parsedBaseUrl.protocol !== 'https:'
  ) {
    throw new TypeError('API base URL must be an absolute HTTP(S) URL.');
  }

  parsedBaseUrl.pathname = `${parsedBaseUrl.pathname.replace(/\/$/, '')}/`;

  return {
    async health() {
      const response = await fetchImplementation(
        new URL('health', parsedBaseUrl),
        {
          headers: { accept: 'application/json' },
          method: 'GET',
        },
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const health = healthResponseSchema.safeParse(payload);

      if (!health.success) {
        throw new ApiProtocolError();
      }

      return health.data;
    },
    async readiness() {
      const response = await fetchImplementation(
        new URL('ready', parsedBaseUrl),
        {
          headers: { accept: 'application/json' },
          method: 'GET',
        },
      );
      const payload = await readJson(response);

      if (response.status === 503) {
        const readiness = readinessResponseSchema.safeParse(payload);

        if (!readiness.success || readiness.data.status !== 'not_ready') {
          throw new ApiProtocolError();
        }

        return readiness.data;
      }

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const readiness = readinessResponseSchema.safeParse(payload);

      if (!readiness.success || readiness.data.status !== 'ready') {
        throw new ApiProtocolError();
      }

      return readiness.data;
    },
  };
}
