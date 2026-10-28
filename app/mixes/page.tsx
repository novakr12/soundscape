import type { Metadata } from "next";
import {
  getDiscoverMix,
  getRediscoverMix,
  type MixSong,
  PLAYLIST_NAMES,
  REDISCOVER_AFTER_DAYS,
  trackDetails,
} from "@/lib/mixes";
import { getNavidrome } from "@/lib/navidrome";
import { privateUsers } from "@/lib/privacy";
import { because } from "@/lib/recommendations";
import { requireUserId } from "@/lib/session";
import { TIME_ZONE } from "@/lib/time";
import { getWanted } from "@/lib/wanted";
import MixSection from "./mix-section";
import WantList from "./want-list";

export const metadata: Metadata = { title: "Mixes · Soundscape" };

const AFTER = `${REDISCOVER_AFTER_DAYS} days`;

const row = (song: MixSong, note?: string) => ({
  trackId: song.trackId,
  title: song.title,
  artist: song.artist,
  cover: song.cover,
  deezerId: song.deezerId,
  note,
});

const monthYear = (date: Date) =>
  date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: TIME_ZONE });

export default async function MixesPage() {
  const userId = await requireUserId();
  const [discover, rediscover, wanted, navidrome] = await Promise.all([
    getDiscoverMix(userId),
    getRediscoverMix(userId),
    getWanted(userId),
    getNavidrome(userId),
  ]);
  const [hidden, wantedDetails] = await Promise.all([
    privateUsers(discover.flatMap((song) => song.via ?? [])),
    trackDetails(wanted.map((song) => song.trackId)),
  ]);
  const wantedIds = wanted.map((song) => song.trackId);
  const connected = navidrome !== null;

  return (
    <>
      <h1>Mixes</h1>
      <p className="muted">
        Save a mix and Soundscape looks for every song in your Navidrome library, then saves the ones you have as a
        playlist. Songs you don&apos;t have get a preview, links to find them and a Want button.
      </p>

      <MixSection
        kind="discover"
        title="Discover"
        description="New songs from listeners with similar taste."
        empty="Nothing to discover yet. Play a few songs so Soundscape can find listeners like you."
        playlist={PLAYLIST_NAMES.discover}
        songs={discover.map((song) => row(song, because(song.via ?? [], hidden)))}
        wanted={wantedIds}
        connected={connected}
      />

      <MixSection
        kind="rediscover"
        title="Rediscover"
        description={`Songs you played more than once but not in the last ${AFTER}.`}
        empty={`Nothing to rediscover yet. Songs you played more than once show up here after ${AFTER} without a play.`}
        playlist={PLAYLIST_NAMES.rediscover}
        songs={rediscover.map((song) => row(song, `${song.plays} plays · last played ${monthYear(song.lastPlayed!)}`))}
        wanted={wantedIds}
        connected={connected}
      />

      <WantList
        songs={wanted.map((song) => ({ ...row(song), ...wantedDetails.get(song.trackId) }))}
        connected={connected}
      />
    </>
  );
}
