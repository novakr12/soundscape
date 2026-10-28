import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { admins, getAccounts, getLastBackup, getLibraryStatus, isAdmin } from "@/lib/admin";
import { lastfmConfigured } from "@/lib/lastfm";
import { currentUserId } from "@/lib/session";
import { signupMode } from "@/lib/signups";
import { formatDateTime } from "@/lib/time";
import Maintenance from "./maintenance";

export const metadata: Metadata = { title: "Admin · Soundscape" };

const BACKUP_OLD_MS = 2 * 24 * 60 * 60 * 1000;

function share(part: number, whole: number) {
  return whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;
}

export default async function AdminPage() {
  if (!isAdmin(await currentUserId())) notFound();
  const [accounts, library, backup] = await Promise.all([getAccounts(), getLibraryStatus(), getLastBackup()]);
  const backupOld = !backup || Date.now() - backup.at.getTime() > BACKUP_OLD_MS;

  const tiles = [
    { label: "Accounts", value: accounts.length },
    { label: "Plays", value: library.plays },
    { label: "Songs", value: library.songs },
    { label: "Artists", value: library.artists },
    { label: "Albums", value: library.albums },
  ];

  return (
    <>
      <h1>Admin</h1>

      <div className="tiles stats-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>

      <section>
        <h2>Server</h2>
        <dl className="facts">
          <dt>Sign-ups</dt>
          <dd>{signupMode()}</dd>
          <dt>Last.fm import</dt>
          <dd>{lastfmConfigured() ? "on" : "off, no LASTFM_API_KEY"}</dd>
          <dt>Admins</dt>
          <dd>{admins().join(", ")}</dd>
          <dt>Last backup</dt>
          <dd className={backupOld ? "error" : undefined}>
            {backup
              ? `${formatDateTime(backup.at)} · ${backup.file}${backup.size ? ` (${backup.size})` : ""}`
              : "None recorded. Run scripts/backup.sh or install the nightly timer."}
          </dd>
        </dl>
      </section>

      <section>
        <h2>Library</h2>
        <dl className="facts">
          <dt>Covers</dt>
          <dd>
            {share(library.withCover, library.songs)} of songs ({library.withCover.toLocaleString("en")} of{" "}
            {library.songs.toLocaleString("en")})
          </dd>
          <dt>Albums</dt>
          <dd>
            {share(library.withAlbum, library.songs)} of songs ({library.withAlbum.toLocaleString("en")} of{" "}
            {library.songs.toLocaleString("en")})
          </dd>
          <dt>Genres</dt>
          <dd>
            {share(library.withGenres, library.artists)} of artists, {share(library.genresChecked, library.artists)}{" "}
            checked on MusicBrainz
          </dd>
        </dl>
        <p className="muted">
          Fill in more with <code>npm run db:covers</code>, <code>npm run db:albums</code> and{" "}
          <code>npm run db:genres</code>.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Plays</th>
                <th>Last played</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.username}>
                  <td>
                    <Link href={`/u/${encodeURIComponent(account.username)}`}>{account.username}</Link>
                    {account.private && <span className="muted"> · private</span>}
                  </td>
                  <td>{account.plays.toLocaleString("en")}</td>
                  <td className="muted">
                    {account.lastPlay ? formatDateTime(new Date(account.lastPlay.playedAt)) : "–"}
                  </td>
                  <td className="muted">{account.createdAt ? formatDateTime(account.createdAt) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Maintenance</h2>
        <Maintenance />
      </section>
    </>
  );
}
