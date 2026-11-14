import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/cover";
import FollowButton from "@/components/follow-button";
import HistoryView from "@/components/history-view";
import ListeningRecordView from "@/components/listening-record";
import { ArtistLink, SongLink } from "@/components/music-links";
import ProfileUpdates from "@/components/profile-updates";
import SongProgress from "@/components/song-progress";
import StatsView from "@/components/stats-view";
import TasteMatchCard from "@/components/taste-match";
import { artistIdFor } from "@/lib/catalog";
import { followCounts, isFollowing } from "@/lib/follows";
import { getListening } from "@/lib/live";
import { lovedSongs } from "@/lib/loved";
import { getListeningRecord } from "@/lib/milestones";
import { isPrivate } from "@/lib/privacy";
import { currentUserId } from "@/lib/session";
import { tasteMatch } from "@/lib/taste";
import { existingIds } from "@/lib/tracks";
import { userExists } from "@/lib/users";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ month?: string; page?: string }>;
};

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  const [exists, viewer, hidden] = await Promise.all([userExists(username), currentUserId(), isPrivate(username)]);
  if (!exists) notFound();

  const isOwner = viewer === username;
  if (hidden && !isOwner) {
    return (
      <>
        <h1>{username}</h1>
        <p className="muted">This profile is private.</p>
      </>
    );
  }

  const [listening, { month, page }, counts, following, match, record, loved] = await Promise.all([
    getListening(username),
    searchParams,
    followCounts(username),
    viewer && !isOwner ? isFollowing(viewer, username) : false,
    viewer && !isOwner ? tasteMatch(viewer, username) : null,
    getListeningRecord(username),
    lovedSongs(username),
  ]);
  const profilePath = `/u/${encodeURIComponent(username)}`;
  const known = listening
    ? await existingIds([listening.trackId], [artistIdFor(listening.artist)])
    : { tracks: new Set<string>(), artists: new Set<string>() };

  return (
    <>
      <div className="profile-head">
        <h1>{username}</h1>
        {viewer && !isOwner && <FollowButton username={username} following={following} />}
      </div>
      <p className="follow-counts">
        <Link href={`${profilePath}/followers`}>{plural(counts.followers, "follower")}</Link>
        <span className="muted"> · </span>
        <Link href={`${profilePath}/following`}>{counts.following.toLocaleString("en")} following</Link>
      </p>
      <ProfileUpdates username={username} />
      {match && <TasteMatchCard match={match} />}
      {viewer && !isOwner && (
        <p>
          <Link href={`${profilePath}/compare`}>Compare your Yearscapes</Link>
        </p>
      )}
      {isOwner && (
        <p className="muted">
          {hidden ? "Your profile is private. Only you can see this page." : "Your profile is public."}{" "}
          <Link href="/settings">Change</Link>
        </p>
      )}

      {listening && (
        <div className="now-listening">
          <Cover src={listening.cover} />
          <span className="listening-info">
            <span>
              <span className="muted">Listening now:</span>{" "}
              <strong>
                {known.tracks.has(listening.trackId) ? (
                  <SongLink trackId={listening.trackId}>{listening.title}</SongLink>
                ) : (
                  listening.title
                )}
              </strong>{" "}
              <span className="muted">
                ·{" "}
                {known.artists.has(artistIdFor(listening.artist)) ? (
                  <ArtistLink name={listening.artist} />
                ) : (
                  listening.artist
                )}
              </span>
            </span>
            {listening.startedAt && (
              <SongProgress
                startedAt={listening.startedAt}
                durationMs={listening.durationMs}
                pausedAt={listening.pausedAt}
                serverNow={Date.now()}
              />
            )}
          </span>
        </div>
      )}

      <ListeningRecordView record={record} />

      {loved.length > 0 && (
        <section>
          <h2>Loved songs</h2>
          <ul className="listening-list">
            {loved.map((song) => (
              <li key={song.trackId}>
                <Cover src={song.cover} />
                <span className="listening-info">
                  <span>
                    <SongLink trackId={song.trackId}>{song.title}</SongLink>{" "}
                    <span className="muted">
                      · <ArtistLink name={song.artist} />
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Stats</h2>
        <StatsView userId={username} />
      </section>

      <section>
        <h2>Listening history</h2>
        <HistoryView userId={username} month={month} page={page} basePath={`/u/${encodeURIComponent(username)}`} />
      </section>
    </>
  );
}
