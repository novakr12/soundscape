import AlbumList from "@/components/album-list";
import Cover from "@/components/cover";
import { ArtistLink, SongLink } from "@/components/music-links";
import type { Monthscape, Yearscape } from "@/lib/yearscape";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export default function ScapeSummary({ scape }: { scape: Yearscape | Monthscape }) {
  const streak = scape.longestStreak;

  return (
    <>
      <section className="highlights">
        {scape.busiestDay && (
          <p>
            Your biggest day was <strong>{dayLabel(scape.busiestDay.day)}</strong> with{" "}
            {plural(scape.busiestDay.plays, "play")}.
          </p>
        )}
        {streak && streak.days > 1 && (
          <p>
            Your longest streak was <strong>{streak.days} days in a row</strong>, from {dayLabel(streak.from)} to{" "}
            {dayLabel(streak.to)}.
          </p>
        )}
      </section>

      <div className="columns">
        <section>
          <h2>Top songs</h2>
          <ol className="ranked-list">
            {scape.topSongs.map((song, index) => (
              <li key={song.trackId}>
                <span className="rank muted">{index + 1}</span>
                <Cover src={song.cover} />
                <span className="listening-info">
                  <span>
                    <SongLink trackId={song.trackId}>{song.title}</SongLink>{" "}
                    <span className="muted">
                      · <ArtistLink name={song.artist} />
                    </span>
                  </span>
                  <small className="muted">{plural(song.plays, "play")}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>Top artists</h2>
          <ol className="ranked-list">
            {scape.topArtists.map((artist, index) => (
              <li key={artist.name}>
                <span className="rank muted">{index + 1}</span>
                <Cover src={artist.cover} round={artist.photo} />
                <span className="listening-info">
                  <ArtistLink name={artist.name} />
                  <small className="muted">{plural(artist.plays, "play")}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {scape.topAlbums.length > 0 && (
        <section>
          <h2>Top albums</h2>
          <AlbumList albums={scape.topAlbums} />
        </section>
      )}

      {scape.topGenres.length > 0 && (
        <section>
          <h2>Top genres</h2>
          <ol className="genre-list">
            {scape.topGenres.map((genre) => (
              <li key={genre.name}>
                {genre.name} <span className="muted">· {plural(genre.plays, "play")}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
