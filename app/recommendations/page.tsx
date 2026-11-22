import Link from "next/link";
import Cover from "@/components/cover";
import { ArtistLink, SongLink } from "@/components/music-links";
import PlayAllButton from "@/components/play-all-button";
import PlayButton from "@/components/play-button";
import { newReleasesFor } from "@/lib/new-releases";
import { privateUsers } from "@/lib/privacy";
import { because, getRecommendations, getSimilarListeners } from "@/lib/recommendations";
import { requireUserId } from "@/lib/session";

export default async function RecommendationsPage() {
  const userId = await requireUserId();

  const [recommendations, similar, releases] = await Promise.all([
    getRecommendations(userId),
    getSimilarListeners(userId),
    newReleasesFor(userId),
  ]);
  const hidden = await privateUsers([...similar.map((s) => s.userId), ...recommendations.flatMap((r) => r.via)]);

  return (
    <>
      <h1>Recommendations</h1>

      {releases.length > 0 && (
        <section>
          <h2>New from artists you play</h2>
          <ul className="listening-list">
            {releases.map((release) => (
              <li key={release.mbid}>
                <Cover />
                <span className="listening-info">
                  <span>
                    <a
                      className="music-link"
                      href={`https://musicbrainz.org/release-group/${release.mbid}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {release.title}
                    </a>{" "}
                    <span className="muted">
                      · <ArtistLink name={release.artist} />
                    </span>
                  </span>
                  <small className="muted">
                    {release.kind} · {release.released} ·{" "}
                    <Link href={`/music?q=${encodeURIComponent(release.title)}`} prefetch={false}>
                      Look in your Navidrome
                    </Link>
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Listeners like you</h2>
        {similar.length === 0 ? (
          <p className="muted">No overlap with other listeners yet.</p>
        ) : (
          <ul>
            {similar.map((s, index) => (
              <li key={hidden.has(s.userId) ? `similar-${index}` : s.userId}>
                {hidden.has(s.userId) ? (
                  <strong>A listener with similar taste</strong>
                ) : (
                  <Link href={`/u/${s.userId}`} prefetch={false}>
                    <strong>{s.userId}</strong>
                  </Link>
                )}{" "}
                <span className="muted">
                  {s.shared} shared {s.shared === 1 ? "track" : "tracks"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Tracks you haven&apos;t played</h2>
          <PlayAllButton
            tracks={recommendations.map((rec) => ({
              trackId: rec.trackId,
              title: rec.title,
              artist: rec.artist,
              cover: rec.cover,
            }))}
          />
        </div>
        {recommendations.length === 0 ? (
          <p className="muted">Nothing yet. Play a few tracks so we can find listeners like you.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Track</th>
                <th>Artist</th>
                <th>Because</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((rec) => (
                <tr key={rec.trackId}>
                  <td>
                    <SongLink trackId={rec.trackId}>{rec.title}</SongLink>
                  </td>
                  <td>
                    <ArtistLink name={rec.artist} />
                  </td>
                  <td className="muted">{because(rec.via, hidden)}</td>
                  <td className="muted">{rec.score}</td>
                  <td>
                    <PlayButton
                      track={{ trackId: rec.trackId, title: rec.title, artist: rec.artist, cover: rec.cover }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
