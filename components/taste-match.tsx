import { ArtistLink } from "@/components/music-links";
import type { TasteMatch } from "@/lib/taste";

export default function TasteMatchCard({ match }: { match: TasteMatch }) {
  const others = match.sharedCount - match.sharedArtists.length;

  return (
    <div className="taste-match">
      <strong className="match-score">{match.score}%</strong>
      <span className="listening-info">
        <span>Taste match with you</span>
        <small className="muted">
          {match.sharedCount === 0 ? (
            "No artists in common yet."
          ) : (
            <>
              You both play{" "}
              {match.sharedArtists.map((artist, index) => (
                <span key={artist.id}>
                  {index > 0 && (index === match.sharedArtists.length - 1 && others === 0 ? " and " : ", ")}
                  <ArtistLink name={artist.name} />
                </span>
              ))}
              {others > 0 && ` and ${others.toLocaleString("en")} more ${others === 1 ? "artist" : "artists"}`}.
            </>
          )}
        </small>
      </span>
    </div>
  );
}
