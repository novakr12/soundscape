import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Cover from "@/components/cover";
import { ArtistLink } from "@/components/music-links";
import PlayButton from "@/components/play-button";
import { DailyPlaysChart } from "@/components/stats-charts";
import { albumOf } from "@/lib/albums";
import { currentUserId } from "@/lib/session";
import { getAlsoPlayed, getTrack, getTrackPlaysPerDay, getYourPlays } from "@/lib/tracks";

type Props = { params: Promise<{ trackId: string }> };

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

function duration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const track = await getTrack(decodeURIComponent((await params).trackId));
  return { title: track ? `${track.title} · ${track.artist} · Soundscape` : "Soundscape" };
}

export default async function TrackPage({ params }: Props) {
  const trackId = decodeURIComponent((await params).trackId);
  const [track, viewer] = await Promise.all([getTrack(trackId), currentUserId()]);
  if (!track) notFound();

  const [daily, yourPlays, alsoPlayed, album] = await Promise.all([
    getTrackPlaysPerDay(trackId),
    viewer ? getYourPlays(viewer, trackId) : null,
    getAlsoPlayed(trackId),
    albumOf(trackId),
  ]);
  const last30 = daily.reduce((sum, d) => sum + d.plays, 0);

  const tiles = [
    { label: "Plays", value: track.plays },
    { label: "Listeners", value: track.listeners },
    ...(yourPlays === null ? [] : [{ label: "Your plays", value: yourPlays }]),
  ];

  return (
    <>
      <div className="song-header">
        <Cover src={track.cover} large />
        <div>
          <p className="muted">Song</p>
          <h1>{track.title}</h1>
          <p>
            <Link href={`/artist/${encodeURIComponent(track.artistId)}`}>{track.artist}</Link>
            {album && (
              <>
                <span className="muted"> · </span>
                <Link href={`/album/${encodeURIComponent(album.albumId)}`}>{album.title}</Link>
              </>
            )}
            {track.durationMs && <span className="muted"> · {duration(track.durationMs)}</span>}
          </p>
          {viewer && <PlayButton track={{ trackId, title: track.title, artist: track.artist, cover: track.cover }} />}
        </div>
      </div>

      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>

      <section className="chart-card">
        <h2>Plays per day</h2>
        <p className="muted">Last 30 days, everyone together.</p>
        {last30 === 0 ? <p className="muted">No plays in the last 30 days.</p> : <DailyPlaysChart data={daily} />}
      </section>

      <section>
        <h2>People who play this also play</h2>
        {alsoPlayed.length === 0 ? (
          <p className="muted">Not enough listeners yet.</p>
        ) : (
          <ul className="listening-list">
            {alsoPlayed.map((other) => (
              <li key={other.trackId}>
                <Cover src={other.cover} />
                <span className="listening-info">
                  <span>
                    <Link href={`/track/${encodeURIComponent(other.trackId)}`}>{other.title}</Link>{" "}
                    <span className="muted">
                      · <ArtistLink name={other.artist} />
                    </span>
                  </span>
                  <small className="muted">{plural(other.listeners, "listener")} in common</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
