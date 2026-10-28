import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Cover from "@/components/cover";
import { ArtistLink, SongLink } from "@/components/music-links";
import { type ComparedArtist, compareYears } from "@/lib/compare";
import { isPrivate } from "@/lib/privacy";
import { requireUserId } from "@/lib/session";
import { formatListeningTime, localDay } from "@/lib/time";
import { userExists } from "@/lib/users";
import type { Yearscape } from "@/lib/yearscape";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ year?: string }>;
};

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const username = decodeURIComponent((await params).username).toLowerCase();
  return { title: `You and ${username} · Soundscape` };
}

function ArtistRows({ artists, them }: { artists: ComparedArtist[]; them: string }) {
  return (
    <ul className="listening-list">
      {artists.map((artist) => (
        <li key={artist.artistId}>
          <Cover src={artist.photo} round={Boolean(artist.photo)} />
          <span className="listening-info">
            <ArtistLink name={artist.name} />
            <small className="muted">
              {artist.mine > 0 && `you ${plural(artist.mine, "play")}`}
              {artist.mine > 0 && artist.theirs > 0 && " · "}
              {artist.theirs > 0 && `${them} ${plural(artist.theirs, "play")}`}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

const stats = (scape: Yearscape) => [
  scape.plays.toLocaleString("en"),
  formatListeningTime(scape.listeningMs),
  plural(scape.longestStreak?.days ?? 0, "day"),
  scape.artists.toLocaleString("en"),
  scape.songs.toLocaleString("en"),
  scape.newArtists.length.toLocaleString("en"),
];

const STAT_LABELS = ["Plays", "Listening time", "Longest streak", "Artists", "Songs", "New artists"];

export default async function ComparePage({ params, searchParams }: Props) {
  const viewer = await requireUserId();
  const username = decodeURIComponent((await params).username).toLowerCase();
  const currentYear = Number(localDay(new Date()).slice(0, 4));
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= currentYear ? requested : currentYear;
  if (username === viewer) redirect(`/yearscape?year=${year}`);
  const [exists, hidden] = await Promise.all([userExists(username), isPrivate(username)]);
  if (!exists || hidden) notFound();

  const comparison = await compareYears(viewer, username, year);
  const { mine, theirs } = comparison;
  const path = `/u/${encodeURIComponent(username)}/compare`;
  const [myStats, theirStats] = [stats(mine), stats(theirs)];

  return (
    <>
      <h1>
        Your {year} and <Link href={`/u/${encodeURIComponent(username)}`}>{username}</Link>&apos;s
      </h1>
      {comparison.years.length > 1 && (
        <nav className="year-links" aria-label="Years">
          {comparison.years.map((other) =>
            other === year ? (
              <strong key={other} aria-current="page">
                {other}
              </strong>
            ) : (
              <Link key={other} href={`${path}?year=${other}`}>
                {other}
              </Link>
            ),
          )}
        </nav>
      )}

      {mine.plays === 0 || theirs.plays === 0 ? (
        <p className="muted">
          {mine.plays === 0 && theirs.plays === 0
            ? `Neither of you has plays in ${year}.`
            : mine.plays === 0
              ? `You have no plays in ${year}${year === currentYear ? " yet" : ""}.`
              : `${username} has no plays in ${year}${year === currentYear ? " yet" : ""}.`}
        </p>
      ) : (
        <>
          <div className="taste-match">
            <strong className="match-score">{comparison.score}%</strong>
            <span className="listening-info">
              <span>Your {year} taste match</span>
              <small className="muted">
                {comparison.sharedArtistCount === 0
                  ? "No artists in common this year."
                  : `${plural(comparison.sharedArtistCount, "artist")} you both played.`}
              </small>
            </span>
          </div>

          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th />
                  <th>You</th>
                  <th>{username}</th>
                </tr>
              </thead>
              <tbody>
                {STAT_LABELS.map((label, index) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{myStats[index]}</td>
                    <td>{theirStats[index]}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Top song</th>
                  <td>
                    {mine.topSongs[0] && (
                      <SongLink trackId={mine.topSongs[0].trackId}>{mine.topSongs[0].title}</SongLink>
                    )}
                  </td>
                  <td>
                    {theirs.topSongs[0] && (
                      <SongLink trackId={theirs.topSongs[0].trackId}>{theirs.topSongs[0].title}</SongLink>
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Top artist</th>
                  <td>{mine.topArtists[0] && <ArtistLink name={mine.topArtists[0].name} />}</td>
                  <td>{theirs.topArtists[0] && <ArtistLink name={theirs.topArtists[0].name} />}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <section>
            <h2>Artists you both played</h2>
            {comparison.sharedArtists.length === 0 ? (
              <p className="muted">None this year.</p>
            ) : (
              <ArtistRows artists={comparison.sharedArtists} them={username} />
            )}
          </section>

          <div className="columns">
            <section>
              <h2>Only you</h2>
              {comparison.onlyMine.length === 0 ? (
                <p className="muted">{username} played every artist you did.</p>
              ) : (
                <ArtistRows artists={comparison.onlyMine} them={username} />
              )}
            </section>
            <section>
              <h2>Only {username}</h2>
              {comparison.onlyTheirs.length === 0 ? (
                <p className="muted">You played every artist {username} did.</p>
              ) : (
                <ArtistRows artists={comparison.onlyTheirs} them={username} />
              )}
            </section>
          </div>

          {comparison.sharedSongs.length > 0 && (
            <section>
              <h2>Songs you both played</h2>
              <ul className="listening-list">
                {comparison.sharedSongs.map((song) => (
                  <li key={song.trackId}>
                    <Cover src={song.cover} />
                    <span className="listening-info">
                      <span>
                        <SongLink trackId={song.trackId}>{song.title}</SongLink>{" "}
                        <span className="muted">
                          · <ArtistLink name={song.artist} />
                        </span>
                      </span>
                      <small className="muted">
                        you {plural(song.mine, "play")} · {username} {plural(song.theirs, "play")}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
