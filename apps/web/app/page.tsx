import { FoundationMessage } from '@fitness-os/ui';

export default function HomePage() {
  return (
    <>
      <FoundationMessage />
      <nav className="catalog">
        <a href="/movements">Movements</a>
      </nav>
    </>
  );
}
