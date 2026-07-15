import { ExploreMap } from './explore-map';

export default function Page() {
  return (
    <main>
      <header>
        <p className="eyebrow">Pulso technical slice</p>
        <h1>Explore Montréal</h1>
        <p>
          One synthetic event, loaded through the shared public API contract.
        </p>
      </header>
      <ExploreMap />
    </main>
  );
}
