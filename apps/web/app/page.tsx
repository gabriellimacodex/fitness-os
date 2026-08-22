import { loadMovements } from './movements/page';
import { HomeView } from './home-view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const catalog = await loadMovements();
  const today = catalog.status === 'ready' ? catalog.items[0] : undefined;

  return <HomeView today={today} />;
}
