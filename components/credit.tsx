const REPOSITORY = "https://github.com/novakr12/soundscape";

export default function Credit() {
  return (
    <footer className="credit">
      <a href={REPOSITORY}>Soundscape</a> by novakr12 · <a href={`${REPOSITORY}/blob/main/LICENSE`}>AGPL-3.0</a>
    </footer>
  );
}
