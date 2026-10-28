import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getJellyfin } from "@/lib/jellyfin";
import { getNavidrome } from "@/lib/navidrome";
import { getRelay, queuedForUser } from "@/lib/relay";
import { requireUserId } from "@/lib/session";
import { getToken, rotateToken } from "@/lib/tokens";
import { disconnectJellyfin, disconnectNavidrome, stopRelay } from "./actions";
import JellyfinForm from "./jellyfin-form";
import NavidromeForm from "./navidrome-form";
import RelayForm from "./relay-form";

const ADDRESS = "https://your-soundscape-address";

export default async function ConnectPage() {
  const userId = await requireUserId();
  const [token, relay, queued, navidrome, jellyfin] = await Promise.all([
    getToken(userId),
    getRelay(userId),
    queuedForUser(userId),
    getNavidrome(userId),
    getJellyfin(userId),
  ]);

  async function generateToken() {
    "use server";
    await rotateToken(await requireUserId());
    revalidatePath("/connect");
  }

  return (
    <>
      <h1>Connect a music server</h1>
      <p className="muted">
        Navidrome and Jellyfin can send what you play to Soundscape, the same way they send it to ListenBrainz. Plays
        appear in your history and on the live charts as they happen.
      </p>
      <p className="muted">
        In the steps below, replace <code>{ADDRESS}</code> with the address you open Soundscape at, for example{" "}
        <code>http://192.168.1.20:3000</code> or your own domain.
      </p>

      <section>
        <h2>Your token</h2>
        {token ? <code className="token">{token}</code> : <p className="muted">You have no token yet.</p>}
        <form action={generateToken}>
          <button type="submit">{token ? "Generate a new token" : "Generate token"}</button>
        </form>
        {token && <p className="muted">A new token disconnects servers that use the old one.</p>}
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

      <p className="muted">
        If Navidrome or Jellyfin runs in Docker, use your computer&apos;s network address instead of localhost.
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
    </>
  );
}
