import { getCoverProgress } from "@/lib/covers";
import { getLastfmProgress, getLastfmState, lastfmConfigured } from "@/lib/lastfm";
import { getImportState } from "@/lib/listenbrainz";
import { requireUserId } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import CoverStatus from "./cover-status";
import FileImportForm from "./file-import-form";
import ImportForm from "./import-form";
import LastfmForm from "./lastfm-form";

export default async function ImportPage() {
  const userId = await requireUserId();
  const [state, progress, lastfmState, lastfm] = await Promise.all([
    getImportState(userId),
    getCoverProgress(userId),
    getLastfmState(userId),
    getLastfmProgress(userId),
  ]);

  return (
    <>
      <h1>Import</h1>

      <section>
        <h2>ListenBrainz</h2>
        <p className="muted">
          Your public ListenBrainz listens are added to your history. Running it again only adds listens newer than the
          last import.
        </p>
        {state && (
          <p className="muted">
            Last import from <strong>{state.externalUser}</strong>: listens up to {formatDateTime(state.listenedUpTo)}.
          </p>
        )}
        <ImportForm defaultUser={state?.externalUser} />
      </section>

      <section>
        <h2>Last.fm</h2>
        <p className="muted">
          Your whole Last.fm history is added, oldest first. Scrobbles you already have, for example from ListenBrainz,
          are skipped. Running it again only adds newer scrobbles.
        </p>
        {lastfmState && (
          <p className="muted">
            Last import from <strong>{lastfmState.lastfmUser}</strong>: scrobbles up to{" "}
            {formatDateTime(lastfmState.listenedUpTo)}.
          </p>
        )}
        {lastfmConfigured() ? (
          <LastfmForm defaultUser={lastfmState?.lastfmUser} initial={lastfm} />
        ) : (
          <p>
            To import from Last.fm, the server needs a Last.fm API key. Create one for free at{" "}
            <a href="https://www.last.fm/api/account/create">last.fm/api/account/create</a>, add{" "}
            <code>LASTFM_API_KEY=your-key</code> to <code>.env</code> and restart Soundscape.
          </p>
        )}
      </section>

      <section>
        <h2>Spotify</h2>
        <p className="muted">
          Ask Spotify for your <strong>Extended streaming history</strong> on{" "}
          <a href="https://www.spotify.com/account/privacy/">spotify.com/account/privacy</a>. It can take a few days to
          arrive by email. Unzip it and choose all the <code>Streaming_History_Audio</code> files here. The older{" "}
          <code>StreamingHistory</code> files from the basic account data work too.
        </p>
        <p className="muted">
          The files are read in your browser. Only the artist, song, album and time of each play are sent to Soundscape,
          never your IP address or country. Plays under 30 seconds, podcasts and private sessions are left out, and
          plays you already have are skipped.
        </p>
        <FileImportForm source="spotify" />
      </section>

      <section>
        <h2>Apple Music</h2>
        <p className="muted">
          Ask Apple for a copy of your data on <a href="https://privacy.apple.com/">privacy.apple.com</a> and tick{" "}
          <strong>Apple Media Services information</strong>. It can take a few days. Unzip it, open the{" "}
          <code>Apple Music Activity</code> folder and choose <code>Apple Music Play Activity.csv</code> here. Choose{" "}
          <code>Apple Music - Play History Daily Tracks.csv</code> and{" "}
          <code>Apple Music - Recently Played Tracks.csv</code> with it, because newer exports only name the artist in
          those.
        </p>
        <p className="muted">
          The files are read in your browser, and only the artist, song, album and time of each play are sent to
          Soundscape. Plays under 30 seconds and videos are left out, and plays you already have are skipped.
        </p>
        <FileImportForm source="apple" />
      </section>

      {progress && progress.total > 0 && <CoverStatus initial={progress} />}
    </>
  );
}
