import Link from "next/link";
import { Lockup } from "@/components/logo";
import { ArtistLink, SongLink } from "@/components/music-links";
import PlayButton from "@/components/play-button";
import { getRecent } from "@/lib/live";
import { getListeningRecord } from "@/lib/milestones";
import { onThisDay } from "@/lib/on-this-day";
import { currentUserId } from "@/lib/session";
import { signupMode } from "@/lib/signups";
import { formatClock, localDay } from "@/lib/time";

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const userId = await currentUserId();

  if (!userId) {
    const deleted = (await searchParams).deleted === "1";
    return (
      <>
        <Lockup animated heading />
        {deleted && <p className="notice">Your account and all its data were deleted.</p>}
        <p>
          Records every song you play, finds music through listeners with similar taste, and shows what&apos;s trending
          right now.
        </p>
        <p>
          {signupMode() === "open" ? (
            <>
              <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link> to start listening.
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link> to start listening.
            </>
          )}
        </p>
      </>
    );
  }

  const [recent, thatDay, record] = await Promise.all([
    getRecent(userId),
    onThisDay(userId),
    getListeningRecord(userId),
  ]);
  const reachedToday = record.milestones.find(
    (milestone) => milestone.count > 1 && localDay(new Date(milestone.playedAt)) === localDay(new Date()),
  );

  return (
    <>
      <Lockup animated />
      <h1>Welcome back, {userId}</h1>
      {reachedToday && <p className="notice">You reached {reachedToday.count.toLocaleString("en")} plays today!</p>}
      {record.currentStreak > 1 && (
        <p className="muted">
          You&apos;re on a {record.currentStreak}-day listening streak.
          {!record.playedToday && " Play something today to keep it going."}
        </p>
      )}

      {thatDay.length > 0 && (
        <section>
          <h2>On this day</h2>
          {thatDay.map((day) => (
            <div key={day.year} className="that-day">
              <h3>
                {day.yearsAgo === 1 ? "A year ago" : `${day.yearsAgo} years ago`}{" "}
                <span className="muted">
                  · {day.year} · {plural(day.plays, "play")}
                </span>
              </h3>
              <ol className="chart playable">
                {day.songs.map((song, index) => (
                  <li key={song.trackId}>
                    <span className="muted">{index + 1}</span>
                    <span>
                      <SongLink trackId={song.trackId}>{song.title}</SongLink>{" "}
                      <span className="muted">
                        · <ArtistLink name={song.artist} />
                      </span>
                    </span>
                    <span className="muted">{plural(song.plays, "play")}</span>
                    <PlayButton track={song} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>Recently played</h2>
        {recent.length === 0 ? (
          <p className="muted">
            Nothing yet. <Link href="/connect">Connect your music player</Link> or{" "}
            <Link href="/import">import your ListenBrainz history</Link>.
          </p>
        ) : (
          <ol className="chart playable">
            {recent.map((play, index) => (
              <li key={`${play.playedAt}-${index}`}>
                <span className="muted">{index + 1}</span>
                <span>
                  <SongLink trackId={play.trackId}>{play.title}</SongLink>{" "}
                  <span className="muted">
                    · <ArtistLink name={play.artist} />
                  </span>
                </span>
                <span className="muted">{formatClock(new Date(play.playedAt))}</span>
                <PlayButton track={play} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
