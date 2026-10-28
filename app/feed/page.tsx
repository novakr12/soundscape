import type { Metadata } from "next";
import Link from "next/link";
import Cover from "@/components/cover";
import FeedUpdates from "@/components/feed-updates";
import { ArtistLink, SongLink } from "@/components/music-links";
import PlayButton from "@/components/play-button";
import SongProgress from "@/components/song-progress";
import { artistIdFor } from "@/lib/catalog";
import { getFeed, visibleFollowing } from "@/lib/feed";
import { type LeaderboardRow, weeklyLeaderboard } from "@/lib/leaderboard";
import { getListeningNow } from "@/lib/live";
import { requireUserId } from "@/lib/session";
import { formatListeningTime, formatTimeAgo } from "@/lib/time";
import { existingIds } from "@/lib/tracks";

export const metadata: Metadata = { title: "Feed · Soundscape" };

function UserLink({ userId }: { userId: string }) {
  return (
    <Link href={`/u/${encodeURIComponent(userId)}`}>
      <strong>{userId}</strong>
    </Link>
  );
}

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

function Leaderboard({ rows, viewer }: { rows: LeaderboardRow[]; viewer: string }) {
  return (
    <ol className="ranked-list leaderboard">
      {rows.map((row, index) => (
        <li key={row.userId} className={row.userId === viewer ? "you" : undefined}>
          <span className="rank muted">{row.plays > 0 ? index + 1 : "–"}</span>
          <Cover src={row.topArtist?.photo} round={Boolean(row.topArtist?.photo)} />
          <span className="listening-info">
            <span>
              <UserLink userId={row.userId} />
              {row.userId === viewer && <span className="muted"> (you)</span>}
            </span>
            {row.topArtist ? (
              <small className="muted">
                {plural(row.plays, "play")} · {formatListeningTime(row.listeningMs)} · mostly{" "}
                <ArtistLink name={row.topArtist.name} />
              </small>
            ) : (
              <small className="muted">No plays yet this week</small>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function FeedPage() {
  const userId = await requireUserId();
  const following = await visibleFollowing(userId);
  const followingSet = new Set(following);
  const [feed, everyone, leaderboard] = await Promise.all([
    getFeed(following),
    getListeningNow(),
    weeklyLeaderboard([userId, ...following]),
  ]);
  const listening = everyone.filter((l) => followingSet.has(l.userId));
  const known = await existingIds(
    listening.map((l) => l.trackId),
    listening.map((l) => artistIdFor(l.artist)),
  );
  const now = new Date();

  return (
    <>
      <h1>Feed</h1>
      <FeedUpdates users={following} />

      {following.length === 0 ? (
        <p className="muted">
          You don&apos;t follow anyone yet. <Link href="/search">Search for people</Link> or find them on{" "}
          <Link href="/charts">Charts</Link>, then follow them from their profile.
        </p>
      ) : (
        <>
          {listening.length > 0 && (
            <section>
              <h2>Listening now</h2>
              <ul className="listening-list">
                {listening.map((l) => (
                  <li key={l.userId}>
                    <Cover src={l.cover} />
                    <span className="listening-info">
                      <span>
                        <UserLink userId={l.userId} />{" "}
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
            </section>
          )}

          <section>
            <h2>This week</h2>
            <p className="muted">You and the people you follow, by plays since Monday.</p>
            <Leaderboard rows={leaderboard.rows} viewer={userId} />
            {leaderboard.lastWeek && (
              <p className="muted">
                Last week{" "}
                {leaderboard.lastWeek.userId === userId ? "you" : <UserLink userId={leaderboard.lastWeek.userId} />}{" "}
                came first with {plural(leaderboard.lastWeek.plays, "play")}.
              </p>
            )}
          </section>

          <section>
            <h2>Recent plays</h2>
            {feed.length === 0 ? (
              <p className="muted">Nobody you follow has played anything in the last two months.</p>
            ) : (
              <ul className="listening-list feed">
                {feed.map((item) => (
                  <li key={`${item.userId}-${item.playId}`}>
                    <Cover src={item.cover} />
                    <span className="listening-info">
                      <span>
                        <UserLink userId={item.userId} /> played{" "}
                        <SongLink trackId={item.trackId}>{item.title}</SongLink>{" "}
                        <span className="muted">
                          · <ArtistLink name={item.artist} />
                        </span>
                      </span>
                      <small className="muted">{formatTimeAgo(item.playedAt, now)}</small>
                    </span>
                    <PlayButton
                      track={{ trackId: item.trackId, title: item.title, artist: item.artist, cover: item.cover }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
