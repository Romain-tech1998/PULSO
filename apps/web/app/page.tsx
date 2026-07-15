import { ExploreMap } from './explore-map';

export default function Page() {
  return (
    <main>
      <header>
        <p className="eyebrow">Pulso · Free exploration</p>
        <h1>Explore Montréal</h1>
        <p>
          Explore fictional events for the next seven Montréal calendar days. No
          account or intelligent search is required.
        </p>
      </header>
      <ExploreMap />
    </main>
  );
}
