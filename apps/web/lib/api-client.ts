import {
  apiErrorResponseSchema,
  healthResponseSchema,
  inspectInvitationRequestSchema,
  movementDetailResponseSchema,
  movementListResponseSchema,
  onboardingOperationResponseSchema,
  privacySyntheticGovernanceLifecycleRecordRequestSchema,
  privacySyntheticGovernanceLifecycleRecordResponseSchema,
  privacySyntheticProcessorCoordinateRequestSchema,
  privacySyntheticProcessorCoordinateResponseSchema,
  privacySyntheticProcessorExecuteRequestSchema,
  privacySyntheticProcessorExecuteResponseSchema,
  privacySyntheticProcessorStepRecordRequestSchema,
  privacySyntheticProcessorStepRecordResponseSchema,
  privacySyntheticRetentionExecutionAuthorizeRequestSchema,
  privacySyntheticRetentionExecutionAuthorizeResponseSchema,
  readinessResponseSchema,
  type ApiErrorCode,
  type OnboardingOperationResponse,
  type PrivacySyntheticGovernanceLifecycleRecordRequest,
  type PrivacySyntheticGovernanceLifecycleRecordResponse,
  type PrivacySyntheticProcessorCoordinateRequest,
  type PrivacySyntheticProcessorCoordinateResponse,
  type PrivacySyntheticProcessorExecuteRequest,
  type PrivacySyntheticProcessorExecuteResponse,
  type PrivacySyntheticProcessorStepRecordRequest,
  type PrivacySyntheticProcessorStepRecordResponse,
  type PrivacySyntheticRetentionExecutionAuthorizeRequest,
  type PrivacySyntheticRetentionExecutionAuthorizeResponse,
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

export const MOVEMENT_READ_TIMEOUT_MS = 3_000;

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
};

async function fetchJson(
  fetchImplementation: typeof globalThis.fetch,
  url: URL,
  init: RequestInit = {},
): Promise<{ payload: unknown; response: Response }> {
  const response = await fetchImplementation(url, {
    headers: { accept: 'application/json' },
    method: 'GET',
    ...init,
  });
  const payload = await readJson(response);

  return { payload, response };
}

async function fetchMovementJson(
  fetchImplementation: typeof globalThis.fetch,
  url: URL,
): Promise<{ payload: unknown; response: Response }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, MOVEMENT_READ_TIMEOUT_MS);

  try {
    return await fetchJson(fetchImplementation, url, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ApiProtocolError) {
      throw error;
    }

    throw new ApiProtocolError();
  } finally {
    clearTimeout(timeout);
  }
}

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
      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL('health', parsedBaseUrl),
      );

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
      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL('ready', parsedBaseUrl),
      );

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
    async movements() {
      const { payload, response } = await fetchMovementJson(
        fetchImplementation,
        new URL('movements', parsedBaseUrl),
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const list = movementListResponseSchema.safeParse(payload);

      if (!list.success) {
        throw new ApiProtocolError();
      }

      return list.data;
    },
    async movement(movementId: string) {
      const { payload, response } = await fetchMovementJson(
        fetchImplementation,
        new URL(`movements/${encodeURIComponent(movementId)}`, parsedBaseUrl),
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const detail = movementDetailResponseSchema.safeParse(payload);

      if (!detail.success) {
        throw new ApiProtocolError();
      }

      return detail.data;
    },
    async onboardingInspectInvitation(
      claimSecret: string,
    ): Promise<OnboardingOperationResponse> {
      const body = inspectInvitationRequestSchema.parse({ claimSecret });

      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL('v1/onboarding/invitations/inspect', parsedBaseUrl),
        {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const operation = onboardingOperationResponseSchema.safeParse(payload);

      if (!operation.success) {
        throw new ApiProtocolError();
      }

      return operation.data;
    },
    async privacyRetentionExecutionAuthorize(
      request: PrivacySyntheticRetentionExecutionAuthorizeRequest,
    ): Promise<PrivacySyntheticRetentionExecutionAuthorizeResponse> {
      const body =
        privacySyntheticRetentionExecutionAuthorizeRequestSchema.parse(request);

      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL(
          'v1/privacy/synthetic/retention-execution-authorize',
          parsedBaseUrl,
        ),
        {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const authorization =
        privacySyntheticRetentionExecutionAuthorizeResponseSchema.safeParse(
          payload,
        );

      if (!authorization.success) {
        throw new ApiProtocolError();
      }

      return authorization.data;
    },
    async privacyProcessorCoordinate(
      request: PrivacySyntheticProcessorCoordinateRequest,
    ): Promise<PrivacySyntheticProcessorCoordinateResponse> {
      const body =
        privacySyntheticProcessorCoordinateRequestSchema.parse(request);

      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL('v1/privacy/synthetic/processor-coordinate', parsedBaseUrl),
        {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const coordination =
        privacySyntheticProcessorCoordinateResponseSchema.safeParse(payload);

      if (!coordination.success) {
        throw new ApiProtocolError();
      }

      return coordination.data;
    },
    async privacyProcessorStepRecord(
      request: PrivacySyntheticProcessorStepRecordRequest,
    ): Promise<PrivacySyntheticProcessorStepRecordResponse> {
      const body =
        privacySyntheticProcessorStepRecordRequestSchema.parse(request);

      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL('v1/privacy/synthetic/processor-step-record', parsedBaseUrl),
        {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const record =
        privacySyntheticProcessorStepRecordResponseSchema.safeParse(payload);

      if (!record.success) {
        throw new ApiProtocolError();
      }

      return record.data;
    },
    async privacyGovernanceLifecycleRecord(
      request: PrivacySyntheticGovernanceLifecycleRecordRequest,
    ): Promise<PrivacySyntheticGovernanceLifecycleRecordResponse> {
      const body =
        privacySyntheticGovernanceLifecycleRecordRequestSchema.parse(request);

      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL(
          'v1/privacy/synthetic/governance-lifecycle-record',
          parsedBaseUrl,
        ),
        {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const record =
        privacySyntheticGovernanceLifecycleRecordResponseSchema.safeParse(
          payload,
        );

      if (!record.success) {
        throw new ApiProtocolError();
      }

      return record.data;
    },
    async privacyProcessorExecute(
      request: PrivacySyntheticProcessorExecuteRequest,
    ): Promise<PrivacySyntheticProcessorExecuteResponse> {
      const body = privacySyntheticProcessorExecuteRequestSchema.parse(request);

      const { payload, response } = await fetchJson(
        fetchImplementation,
        new URL('v1/privacy/synthetic/processor-execute', parsedBaseUrl),
        {
          body: JSON.stringify(body),
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          method: 'POST',
        },
      );

      if (!response.ok) {
        throwApiError(response, payload);
      }

      const result =
        privacySyntheticProcessorExecuteResponseSchema.safeParse(payload);

      if (!result.success) {
        throw new ApiProtocolError();
      }

      return result.data;
    },
  };
}
