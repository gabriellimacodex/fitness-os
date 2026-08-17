import { createApiClient } from '../../lib/api-client';
import { getApiBaseUrl } from '../../lib/api-base-url';
import { MovementsListView, type CatalogLoadState } from './movement-views';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function loadMovements(
  client = createApiClient({ baseUrl: getApiBaseUrl() }),
): Promise<CatalogLoadState> {
  try {
    const { items } = await client.movements();

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
