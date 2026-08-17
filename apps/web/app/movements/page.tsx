import { createApiClient } from '../../lib/api-client';
import { getApiBaseUrl } from '../../lib/api-base-url';
import { MovementsListView, type CatalogLoadState } from './movement-views';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function loadMovements(client?: {
  movements: () => Promise<{
    items: readonly import('@fitness-os/schemas').MovementSummary[];
  }>;
}): Promise<CatalogLoadState> {
  try {
    const api = client ?? createApiClient({ baseUrl: getApiBaseUrl() });
    const { items } = await api.movements();

    return items.length === 0
      ? { status: 'empty' }
      : { status: 'ready', items };
  } catch {
    return { status: 'unavailable' };
  }
}

export default async function MovementsPage() {
  return <MovementsListView state={await loadMovements()} />;
}
