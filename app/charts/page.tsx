import Link from "next/link";
import Cover from "@/components/cover";
import LiveUpdates from "@/components/live-updates";
import { ArtistLink, SongLink } from "@/components/music-links";
import PlayButton from "@/components/play-button";
import SongProgress from "@/components/song-progress";
import { artistIdFor } from "@/lib/catalog";
import { type ChartRow, getChartWithTracks } from "@/lib/charts";
import { listFollowing } from "@/lib/follows";
import { getListeningNow } from "@/lib/live";
import { privateUsers } from "@/lib/privacy";
import { currentUserId } from "@/lib/session";
import { daysThisWeek, formatClockWithZone, localDay } from "@/lib/time";
import { existingIds } from "@/lib/tracks";

export const dynamic = "force-dynamic";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function Chart({ title, rows, canPlay }: { title: string; rows: ChartRow[]; canPlay: boolean }) {
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="muted">No plays yet.</p>
      ) : (
        <ol className="chart">
          {rows.map((row, index) => (
            <li key={row.trackId}>
              <span className="muted">{index + 1}</span>
              <span>
                <SongLink trackId={row.trackId}>{row.title}</SongLink>{" "}
                <span className="muted">
                  · <ArtistLink name={row.artist} />
                </span>
                <small className="muted stats">
                  {plural(row.plays, "play")} · {plural(row.listeners, "listener")}
                </small>
              </span>
              {canPlay && <PlayButton track={row} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function ChartsPage() {
  const now = new Date();
  const [today, week, listening, userId] = await Promise.all([
    getChartWithTracks([localDay(now)]),
    getChartWithTracks(daysThisWeek(now)),
    getListeningNow(),
    currentUserId(),
  ]);
  const [hidden, following] = await Promise.all([
    privateUsers(listening.map((l) => l.userId)),
    userId ? listFollowing(userId).then((users) => new Set(users)) : new Set<string>(),
  ]);
  const visible = listening
    .filter((l) => !hidden.has(l.userId))
    .sort((a, b) => Number(following.has(b.userId)) - Number(following.has(a.userId)));
  const known = await existingIds(
    visible.map((l) => l.trackId),
    visible.map((l) => artistIdFor(l.artist)),
  );

  return (
    <>
      <h1>Live charts</h1>
      <LiveUpdates />
      <p className="muted">Updated {formatClockWithZone(now)}</p>

      <div className="columns">
        <Chart title="Today" rows={today} canPlay={Boolean(userId)} />
        <Chart title="This week" rows={week} canPlay={Boolean(userId)} />
      </div>

      <section>
        <h2>Listening now</h2>
        {visible.length === 0 ? (
          <p className="muted">Nobody in the last minute.</p>
        ) : (
          <ul className="listening-list">
            {visible.map((l) => (
              <li key={l.userId}>
                <Cover src={l.cover} />
                <span className="listening-info">
                  <span>
                    <Link href={`/u/${l.userId}`}>
                      <strong>{l.userId}</strong>
                    </Link>{" "}
                    {following.has(l.userId) && <span className="tag">following</span>}{" "}
                    {known.tracks.has(l.trackId) ? <SongLink trackId={l.trackId}>{l.title}</SongLink> : l.title}{" "}
                    <span className="muted">
                      · {known.artists.has(artistIdFor(l.artist)) ? <ArtistLink name={l.artist} /> : l.artist}
                    </span>
                  </span>
                  {l.startedAt && (
                    <SongProgress
                      startedAt={l.startedAt}
                      durationMs={l.durationMs}
                      pausedAt={l.pausedAt}
                      serverNow={now.getTime()}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
