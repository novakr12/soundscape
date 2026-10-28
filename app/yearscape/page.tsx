import type { Metadata } from "next";
import Link from "next/link";
import { ArtistLink, SongLink } from "@/components/music-links";
import { MonthlyPlaysChart } from "@/components/stats-charts";
import { visibleFollowing } from "@/lib/feed";
import { requireUserId } from "@/lib/session";
import { formatListeningTime, localDay } from "@/lib/time";
import { getYearscape } from "@/lib/yearscape";
import Discoveries from "./discoveries";
import ScapeSummary, { plural } from "./scape-summary";
import ShareCard from "./share-card";

export const metadata: Metadata = { title: "Yearscape · Soundscape" };

type Props = { searchParams: Promise<{ year?: string }> };

const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

export default async function YearscapePage({ searchParams }: Props) {
  const userId = await requireUserId();
  const currentYear = Number(localDay(new Date()).slice(0, 4));
  const requested = Number((await searchParams).year);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= currentYear ? requested : currentYear;
  const [scape, friends] = await Promise.all([getYearscape(userId, year), visibleFollowing(userId)]);
  const streak = scape.longestStreak;

  const tiles = [
    { label: "Plays", value: scape.plays.toLocaleString("en") },
    { label: "Listening time", value: formatListeningTime(scape.listeningMs) },
    { label: "Longest streak", value: plural(streak?.days ?? 0, "day") },
    { label: "Artists", value: scape.artists.toLocaleString("en") },
    { label: "Songs", value: scape.songs.toLocaleString("en") },
    { label: "New artists", value: scape.newArtists.length.toLocaleString("en") },
  ];

  return (
    <>
      <h1>Your {year} Yearscape</h1>
      {scape.years.length > 1 && (
        <nav className="year-links" aria-label="Years">
          {scape.years.map((other) =>
            other === year ? (
              <strong key={other} aria-current="page">
                {other}
              </strong>
            ) : (
              <Link key={other} href={`/yearscape?year=${other}`}>
                {other}
              </Link>
            ),
          )}
        </nav>
      )}

      {scape.plays === 0 ? (
        <p className="muted">
          No plays in {year}
          {year === currentYear ? " yet" : ""}.
        </p>
      ) : (
        <>
          <ShareCard year={year} />
          <div className="tiles stats-tiles">
            {tiles.map((tile) => (
              <div key={tile.label} className="tile">
                <span className="muted">{tile.label}</span>
                <strong>{tile.value}</strong>
              </div>
            ))}
          </div>

          <ScapeSummary scape={scape} />

          <section className="chart-card">
            <h2>Month by month</h2>
            <MonthlyPlaysChart data={scape.months} />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Plays</th>
                    <th>Top song</th>
                    <th>Most played artist</th>
                  </tr>
                </thead>
                <tbody>
                  {scape.months.map((month) => (
                    <tr key={month.month}>
                      <td>
                        {month.plays > 0 ? (
                          <Link href={`/yearscape/${month.month}`}>{monthLabel(month.month)}</Link>
                        ) : (
                          monthLabel(month.month)
                        )}
                      </td>
                      <td>{month.plays}</td>
                      <td>
                        {month.topSong ? (
                          <span className="listening-info">
                            <SongLink trackId={month.topSong.trackId}>{month.topSong.title}</SongLink>
                            <small className="muted">
                              <ArtistLink name={month.topSong.artist} />
                            </small>
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {month.topArtist ? (
                          <ArtistLink name={month.topArtist.name} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>New discoveries</h2>
            {scape.newArtists.length === 0 ? (
              <p className="muted">Every artist you played in {year} was one you already knew.</p>
            ) : (
              <>
                <p>
                  You discovered <strong>{plural(scape.newArtists.length, "new artist")}</strong> in {year}.
                </p>
                <Discoveries artists={scape.newArtists} />
              </>
            )}
          </section>

          {friends.length > 0 && (
            <section>
              <h2>Compare with a friend</h2>
              <nav className="year-links" aria-label="Compare with">
                {friends.map((friend) => (
                  <Link key={friend} href={`/u/${encodeURIComponent(friend)}/compare?year=${year}`}>
                    {friend}
                  </Link>
                ))}
              </nav>
            </section>
          )}
        </>
      )}
    </>
  );
}
