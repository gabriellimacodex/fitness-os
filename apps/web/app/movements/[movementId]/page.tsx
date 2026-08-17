import { notFound } from 'next/navigation';

import { ApiClientError, createApiClient } from '../../../lib/api-client';
import { getApiBaseUrl } from '../../../lib/api-base-url';
import { MovementDetailView, type MovementLoadState } from '../movement-views';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface MovementDetailPageProps {
  params: Promise<{ movementId: string }>;
}

export async function loadMovement(
  movementId: string,
  client = createApiClient({ baseUrl: getApiBaseUrl() }),
): Promise<MovementLoadState> {
  try {
    return {
      movement: await client.movement(movementId),
      status: 'ready',
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'NOT_FOUND') {
      return { status: 'not_found' };
    }

    return { status: 'unavailable' };
  }
}

export default async function MovementDetailPage({
  params,
}: MovementDetailPageProps) {
  const { movementId } = await params;
  const state = await loadMovement(movementId);

  if (state.status === 'not_found') {
    notFound();
  }

  return <MovementDetailView state={state} />;
}
