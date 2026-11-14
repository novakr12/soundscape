import Link from "next/link";
import { getJellyfin } from "@/lib/jellyfin";
import { getLastfmScrobbling, scrobblingConfigured, waitingForLastfm } from "@/lib/lastfm-scrobble";
import { getNavidrome } from "@/lib/navidrome";
import { getRelay, queuedForUser } from "@/lib/relay";
import { requireUserId } from "@/lib/session";
import { formatDateTime, formatTimeAgo } from "@/lib/time";
import { listTokens } from "@/lib/tokens";
import { disconnectJellyfin, disconnectNavidrome, stopLastfm, stopRelay } from "./actions";
import JellyfinForm from "./jellyfin-form";
import NavidromeForm from "./navidrome-form";
import RelayForm from "./relay-form";
import RevokeButton from "./revoke-button";
import TokenForm from "./token-form";

const ADDRESS = "https://your-soundscape-address";

const LASTFM_MESSAGES: Record<string, string> = {
  connected: "Last.fm is connected. New plays will show up there too.",
  expired: "That Last.fm sign-in took too long or came from somewhere else. Try again.",
  unreachable: "Last.fm is unreachable right now. Try again later.",
  refused: "Last.fm didn't accept the connection. Try again.",
  unavailable: "Last.fm scrobbling isn't set up on this server yet.",
};

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ lastfm?: string }> }) {
  const userId = await requireUserId();
  const [tokens, relay, queued, navidrome, jellyfin, lastfm, lastfmWaiting, { lastfm: lastfmOutcome }] =
    await Promise.all([
      listTokens(userId),
      getRelay(userId),
      queuedForUser(userId),
      getNavidrome(userId),
      getJellyfin(userId),
      getLastfmScrobbling(userId),
      waitingForLastfm(userId),
      searchParams,
    ]);
  const lastfmMessage = lastfmOutcome ? LASTFM_MESSAGES[lastfmOutcome] : undefined;

  const now = new Date();

  return (
    <>
      <h1>Connect a music player</h1>
      <p className="muted">
        Navidrome, Jellyfin, your phone and your browser can send what you play to Soundscape, the same way they send it
        to ListenBrainz. Plays appear in your history and on the live charts as they happen.
      </p>
      <p className="muted">
        In the steps below, replace <code>{ADDRESS}</code> with the address you open Soundscape at, for example{" "}
        <code>http://192.168.1.20:3000</code> or your own domain.
      </p>

      <section>
        <h2>Tokens</h2>
        <p className="muted">
          Make one token for each app or device, so you can see which ones still send plays and revoke one without
          touching the others.
        </p>
        {tokens.length > 0 && (
          <div className="table-scroll">
            <table className="tokens">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>
                    <span className="visually-hidden">Revoke</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td>
                      {token.name}
                      {token.hint && <small className="muted"> · ends in {token.hint}</small>}
                    </td>
                    <td className="muted">{formatDateTime(token.createdAt)}</td>
                    <td>
                      {token.lastUsedAt ? formatTimeAgo(token.lastUsedAt, now) : <span className="muted">Never</span>}
                      {token.lastUsedBy && <small className="muted user-agent">{token.lastUsedBy}</small>}
                    </td>
                    <td>
                      <RevokeButton id={token.id} name={token.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TokenForm />
      </section>

      <section>
        <h2>Navidrome</h2>
        <ol>
          <li>
            Set <code>ND_LISTENBRAINZ_BASEURL={ADDRESS}/1/</code> in Navidrome&apos;s environment and restart it.
          </li>
          <li>In Navidrome&apos;s personal settings, turn on scrobbling to ListenBrainz and paste your token.</li>
        </ol>
      </section>

      <section>
        <h2>Jellyfin</h2>
        <ol>
          <li>
            Install the community ListenBrainz plugin (<code>lyarenei/jellyfin-plugin-listenbrainz</code>), following
            its README.
          </li>
          <li>
            In the plugin&apos;s General settings, set <strong>ListenBrainz API URL</strong> to <code>{ADDRESS}</code>,
            without <code>/1</code>.
          </li>
          <li>Under User config, pick your Jellyfin user, paste your token and enable submitting listens.</li>
        </ol>
        <h3 id="jellyfin-position">Exact position</h3>
        <p className="muted">
          The plugin only says when a song starts. With an API key, Soundscape asks Jellyfin every few seconds where you
          are in the song, so pausing and skipping ahead show up in Listening now.
        </p>
        {jellyfin ? (
          <>
            <p>
              Following <strong>{jellyfin.username}</strong> on <strong>{jellyfin.url}</strong>.
            </p>
            <form action={disconnectJellyfin}>
              <button type="submit">Disconnect Jellyfin</button>
            </form>
          </>
        ) : (
          <>
            <p className="muted">
              In Jellyfin, open Dashboard, then API Keys, and add a key named Soundscape. The key can see every
              user&apos;s sessions, but Soundscape only reads the user you name here. It is stored encrypted.
            </p>
            <JellyfinForm />
          </>
        )}
      </section>

      <section>
        <h2>Tauon</h2>
        <ol>
          <li>
            In Tauon&apos;s settings, search for &quot;config&quot; and open the config file. Set{" "}
            <code>custom-listenbrainz-url = &quot;{ADDRESS}&quot;</code>, save, and click Reload.
          </li>
          <li>In Tauon&apos;s ListenBrainz settings, paste your token and enable scrobbling.</li>
        </ol>
      </section>

      <section>
        <h2>Android phone: Pano Scrobbler</h2>
        <p className="muted">
          Pano Scrobbler picks up what any music app on your phone plays, including Spotify, YouTube Music and local
          players.
        </p>
        <ol>
          <li>
            In Pano Scrobbler&apos;s settings, open <strong>Services</strong> and add a{" "}
            <strong>ListenBrainz-like instance</strong>.
          </li>
          <li>
            Set <strong>API URL</strong> to <code>{ADDRESS}/</code>, with the slash at the end and without{" "}
            <code>/1</code>.
          </li>
          <li>
            Paste your token as the <strong>Authentication token</strong> and tap <strong>Verify</strong>.
          </li>
        </ol>
        <p className="muted">
          Only scrobbling goes to Soundscape. Pano&apos;s own charts and history screens may say the server doesn&apos;t
          support them; use Soundscape for those.
        </p>
      </section>

      <section>
        <h2>Browser: Web Scrobbler</h2>
        <p className="muted">
          The Web Scrobbler extension for Chrome and Firefox picks up music played in the browser, like YouTube,
          SoundCloud and Bandcamp.
        </p>
        <ol>
          <li>
            Open the extension&apos;s options, go to <strong>Accounts</strong>, and open the <strong>Properties</strong>{" "}
            of ListenBrainz.
          </li>
          <li>
            Set <strong>API URL</strong> to <code>{ADDRESS}/1/submit-listens</code>, the full address this time.
          </li>
          <li>
            Paste your token as the <strong>Token</strong> and save.
          </li>
        </ol>
        <p className="muted">Loving a song in Web Scrobbler still goes to ListenBrainz itself, not to Soundscape.</p>
      </section>

      <p className="muted">
        If Navidrome or Jellyfin runs in Docker, use your computer&apos;s network address instead of localhost. Phones
        and browsers need an address they can reach from wherever they are, like your Tailscale address.
      </p>

      <section id="navidrome-library">
        <h2>Save mixes to Navidrome</h2>
        <p className="muted">
          With access to your Navidrome library, Soundscape can turn a <Link href="/mixes">mix</Link> into a Navidrome
          playlist with the songs you have.
        </p>
        {navidrome ? (
          <>
            <p>
              Connected to <strong>{navidrome.url}</strong> as <strong>{navidrome.username}</strong>.
            </p>
            <form action={disconnectNavidrome}>
              <button type="submit">Disconnect Navidrome</button>
            </form>
          </>
        ) : (
          <NavidromeForm />
        )}
        <p className="muted">
          Use the address Soundscape can reach, like <code>http://navidrome:4533</code> when both run in the same Docker
          network. The password is stored encrypted and only used to search your library and save playlists.
        </p>
      </section>

      <section>
        <h2>Also send to ListenBrainz</h2>
        <p className="muted">
          A player or server pointed at Soundscape stops sending to ListenBrainz. Soundscape can pass every listen on,
          so your ListenBrainz profile keeps growing.
        </p>
        {relay ? (
          <>
            <p>
              Forwarding your listens to ListenBrainz as <strong>{relay.listenBrainzUser}</strong>.
              {queued > 0 && <span className="muted"> {queued} waiting to be sent.</span>}
            </p>
            <form action={stopRelay}>
              <button type="submit">Stop forwarding</button>
            </form>
          </>
        ) : (
          <RelayForm />
        )}
        <p className="muted">
          Your token is on your ListenBrainz settings page. Forwarded listens are not imported again from ListenBrainz.
        </p>
      </section>

      <section id="lastfm">
        <h2>Also send to Last.fm</h2>
        <p className="muted">
          Soundscape can scrobble what you play to your Last.fm profile as well: plays from Navidrome, your phone, the
          desktop app and anything else that sends to Soundscape, and what you're listening to right now. Imported
          history isn't sent, and Last.fm doesn't take plays older than two weeks.
        </p>
        {lastfmMessage && <p role="status">{lastfmMessage}</p>}
        {!scrobblingConfigured() ? (
          <p className="muted">
            Whoever runs this server needs to add a Last.fm API key and shared secret first: <code>LASTFM_API_KEY</code>{" "}
            and <code>LASTFM_SHARED_SECRET</code> in <code>.env</code>.
          </p>
        ) : lastfm ? (
          <>
            {lastfm.needsReconnect ? (
              <p className="error">
                Last.fm stopped accepting plays for <strong>{lastfm.lastfmUser}</strong>, maybe because the access was
                removed on last.fm. Connect again to carry on.
                {lastfmWaiting > 0 && <> {lastfmWaiting} plays are waiting and will be sent then.</>}
              </p>
            ) : (
              <p>
                Scrobbling to Last.fm as <strong>{lastfm.lastfmUser}</strong>.
                {lastfmWaiting > 0 && <span className="muted"> {lastfmWaiting} waiting to be sent.</span>}
              </p>
            )}
            <div className="export-buttons">
              {lastfm.needsReconnect && (
                <form action="/connect/lastfm" method="get">
                  <button type="submit">Connect Last.fm again</button>
                </form>
              )}
              <form action={stopLastfm}>
                <button type="submit">Stop scrobbling to Last.fm</button>
              </form>
            </div>
          </>
        ) : (
          <form action="/connect/lastfm" method="get">
            <button type="submit">Connect Last.fm</button>
          </form>
        )}
        <p className="muted">
          If Navidrome or another player already scrobbles to Last.fm itself, turn that off, or your plays will show up
          there twice.
        </p>
      </section>
    </>
  );
}
