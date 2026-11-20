import { randomBytes } from "node:crypto";
import {
  DEVICE_ONLINE_MS,
  type Device,
  type DeviceCommand,
  type DeviceTrack,
  type HandedTrack,
  isDeviceId,
  type UpNext,
} from "./devices";
import { findLibrarySong, getNavidrome, isSongId } from "./navidrome";
import { listDevices, sendCommand } from "./player-devices";
import { sql } from "./postgres";

export const PARTY_PREFIX = "party~";
const PARTY_ID = /^[A-Za-z0-9_-]{12}$/;
const DRIFT_SECONDS = 3;
const SEEK_JUMP_SECONDS = 3;
const CORRECT_EVERY_MS = 15_000;
const SETTLE_MS = 12_000;
const MOST_SONGS = 300;
const MOST_ADDS = 30;
const ADDS_WINDOW = "10 minutes";

export type PartyRole = "host" | "guest" | "visitor";

export type PartyUpNext = UpNext & { addedBy: string | null };

export type PartyView = {
  id: string;
  host: string;
  role: PartyRole;
  guests: string[];
  track: DeviceTrack | null;
  playing: boolean;
  upNext: PartyUpNext[];
};

type PartyRow = {
  id: string;
  hostId: string;
  deviceId: string;
  trackId: string | null;
  playing: boolean;
  position: number;
  positionAt: number;
  songs: string[];
};

type MemberRow = {
  userId: string;
  deviceId: string;
  sentTrack: string | null;
  sentPlaying: boolean | null;
  sentAt: number | null;
};

export function isPartyId(value: unknown): value is string {
  return typeof value === "string" && PARTY_ID.test(value);
}

function newPartyId() {
  return randomBytes(9).toString("base64url");
}

export function partySongId(partyId: string, songId: string) {
  return `${PARTY_PREFIX}${partyId}~${songId}`;
}

export function readPartySongId(value: string): { partyId: string; songId: string } | null {
  if (!value.startsWith(PARTY_PREFIX)) return null;
  const [partyId, songId, ...rest] = value.slice(PARTY_PREFIX.length).split("~");
  if (rest.length > 0 || !isPartyId(partyId) || !songId || !isSongId(songId)) return null;
  return { partyId, songId };
}

const NAVIDROME_COVER = "/api/navidrome/cover/";

export function partyCover(partyId: string, cover: string | null) {
  if (!cover?.startsWith(NAVIDROME_COVER)) return cover;
  return `/api/party/${partyId}/cover/${cover.slice(NAVIDROME_COVER.length)}`;
}

export function handedForGuests(partyId: string, track: DeviceTrack, duration: number | null): HandedTrack {
  const cover = partyCover(partyId, track.cover);
  const songId = track.songId && isSongId(track.songId) ? partySongId(partyId, track.songId) : null;
  return {
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    ...(track.album ? { album: track.album } : {}),
    ...(track.albumHref ? { albumHref: track.albumHref } : {}),
    ...(cover ? { cover } : {}),
    ...(songId ? { songId } : {}),
    ...(duration && duration > 0 ? { duration } : {}),
  };
}

export function hostTime(party: Pick<PartyRow, "playing" | "position" | "positionAt">, now: number) {
  return party.playing ? party.position + Math.max(0, now - party.positionAt) / 1000 : party.position;
}

export type GuestStep =
  | { kind: "none" }
  | { kind: "stop" }
  | { kind: "load"; time: number; playing: boolean }
  | { kind: "playing"; playing: boolean; time: number }
  | { kind: "seek"; time: number };

export function stepForGuest(
  host: { trackId: string | null; playing: boolean; time: number; jumped: boolean },
  guest: { sentTrack: string | null; sentPlaying: boolean | null },
): GuestStep {
  if (!host.trackId) return guest.sentPlaying ? { kind: "stop" } : { kind: "none" };
  if (guest.sentTrack !== host.trackId) return { kind: "load", time: host.time, playing: host.playing };
  if (guest.sentPlaying !== host.playing) return { kind: "playing", playing: host.playing, time: host.time };
  if (host.jumped) return { kind: "seek", time: host.time };
  return { kind: "none" };
}

export function drifted(hostSeconds: number, guestSeconds: number) {
  return Math.abs(hostSeconds - guestSeconds) > DRIFT_SECONDS;
}

function toParty(row: Record<string, unknown>): PartyRow {
  return {
    id: row.id as string,
    hostId: row.host_id as string,
    deviceId: row.device_id as string,
    trackId: (row.track_id as string | null) ?? null,
    playing: Boolean(row.playing),
    position: Number(row.position),
    positionAt: (row.position_at as Date).getTime(),
    songs: (row.songs as string[]) ?? [],
  };
}

function toMember(row: Record<string, unknown>): MemberRow {
  return {
    userId: row.user_id as string,
    deviceId: row.device_id as string,
    sentTrack: (row.sent_track as string | null) ?? null,
    sentPlaying: (row.sent_playing as boolean | null) ?? null,
    sentAt: row.sent_at ? (row.sent_at as Date).getTime() : null,
  };
}

async function openParty(id: string): Promise<PartyRow | null> {
  const [row] = await sql`SELECT * FROM parties WHERE id = ${id} AND ended_at IS NULL`;
  return row ? toParty(row) : null;
}

async function hostedParty(hostId: string): Promise<PartyRow | null> {
  const [row] = await sql`SELECT * FROM parties WHERE host_id = ${hostId} AND ended_at IS NULL`;
  return row ? toParty(row) : null;
}

async function guestParty(userId: string): Promise<{ party: PartyRow; member: MemberRow } | null> {
  const [row] = await sql`
    SELECT j.*, m.user_id, m.device_id AS member_device, m.sent_track, m.sent_playing, m.sent_at
    FROM party_members m JOIN parties j ON j.id = m.party_id
    WHERE m.user_id = ${userId} AND m.left_at IS NULL AND j.ended_at IS NULL`;
  if (!row) return null;
  return { party: toParty(row), member: toMember({ ...row, device_id: row.member_device }) };
}

async function guests(partyId: string): Promise<MemberRow[]> {
  const rows =
    await sql`SELECT * FROM party_members WHERE party_id = ${partyId} AND left_at IS NULL ORDER BY joined_at`;
  return rows.map(toMember);
}

async function hostOnline(party: PartyRow) {
  const [row] = await sql`
    SELECT 1 FROM player_devices
    WHERE user_id = ${party.hostId} AND device_id = ${party.deviceId}
      AND seen_at > now() - make_interval(secs => ${DEVICE_ONLINE_MS / 1000})`;
  return Boolean(row);
}

async function send(userId: string, deviceId: string, command: DeviceCommand) {
  await sendCommand(userId, deviceId, command).catch(() => false);
}

async function hostDevice(party: PartyRow): Promise<Device | null> {
  const devices = await listDevices(party.hostId);
  return devices.find((device) => device.id === party.deviceId) ?? null;
}

async function noteSongs(party: PartyRow, songIds: (string | null | undefined)[]) {
  const fresh = songIds.filter(
    (id): id is string => Boolean(id && isSongId(id)) && !party.songs.includes(id as string),
  );
  if (fresh.length === 0) return;
  const songs = [...party.songs, ...fresh].slice(-MOST_SONGS);
  party.songs = songs;
  await sql`UPDATE parties SET songs = ${songs} WHERE id = ${party.id}`;
}

async function bringGuest(party: PartyRow, member: MemberRow, device: Device | null, now: number) {
  const track = device?.state.track ?? null;
  const step = stepForGuest(
    {
      trackId: track?.trackId ?? null,
      playing: Boolean(device?.state.playing),
      time: hostTime(party, now),
      jumped: false,
    },
    { sentTrack: member.sentTrack, sentPlaying: member.sentPlaying },
  );
  await apply(party, member, step, track, device?.state.duration ?? null);
}

async function apply(
  party: PartyRow,
  member: MemberRow,
  step: GuestStep,
  track: DeviceTrack | null,
  duration: number | null,
) {
  if (step.kind === "none") return;
  if (step.kind === "stop") {
    await send(member.userId, member.deviceId, { do: "pause" });
    await mark(party.id, member.userId, member.sentTrack, false);
    return;
  }
  if (step.kind === "load" && track) {
    await send(member.userId, member.deviceId, {
      do: "take",
      tracks: [handedForGuests(party.id, track, duration)],
      position: 0,
      time: step.time,
      playing: step.playing,
    });
    await mark(party.id, member.userId, track.trackId, step.playing);
    return;
  }
  if (step.kind === "playing") {
    if (step.playing) await send(member.userId, member.deviceId, { do: "seek", time: step.time });
    await send(member.userId, member.deviceId, { do: step.playing ? "play" : "pause" });
    await mark(party.id, member.userId, member.sentTrack, step.playing);
    return;
  }
  if (step.kind === "seek") {
    await send(member.userId, member.deviceId, { do: "seek", time: step.time });
    await sql`UPDATE party_members SET sent_at = now() WHERE party_id = ${party.id} AND user_id = ${member.userId}`;
  }
}

async function mark(partyId: string, userId: string, track: string | null, playing: boolean) {
  await sql`
    UPDATE party_members SET sent_track = ${track}, sent_playing = ${playing}, sent_at = now()
    WHERE party_id = ${partyId} AND user_id = ${userId}`;
}

export async function startParty(hostId: string, deviceId?: string): Promise<string | { error: string }> {
  const devices = await listDevices(hostId);
  const chosen =
    (deviceId && devices.find((device) => device.id === deviceId)) ||
    devices.find((device) => device.state.playing) ||
    devices.find((device) => device.state.track) ||
    null;
  if (!chosen) return { error: "Play something first, then start the listening party from the device that plays it." };
  await leaveParty(hostId);
  const existing = await hostedParty(hostId);
  if (existing) {
    await sql`UPDATE parties SET device_id = ${chosen.id} WHERE id = ${existing.id}`;
    return existing.id;
  }
  const id = newPartyId();
  const track = chosen.state.track;
  await sql`
    INSERT INTO parties (id, host_id, device_id, track_id, playing, position, position_at, songs)
    VALUES (${id}, ${hostId}, ${chosen.id}, ${track?.trackId ?? null}, ${chosen.state.playing},
            ${chosen.state.time}, ${new Date(chosen.at)}, ${track?.songId && isSongId(track.songId) ? [track.songId] : []})`;
  return id;
}

export async function endParty(hostId: string) {
  const party = await hostedParty(hostId);
  if (!party) return false;
  await sql`UPDATE parties SET ended_at = now() WHERE id = ${party.id}`;
  const left = await sql`
    UPDATE party_members SET left_at = now() WHERE party_id = ${party.id} AND left_at IS NULL
    RETURNING user_id, device_id`;
  for (const row of left) await send(row.user_id as string, row.device_id as string, { do: "pause" });
  return true;
}

export async function leaveParty(userId: string) {
  const rows = await sql`
    UPDATE party_members SET left_at = now() WHERE user_id = ${userId} AND left_at IS NULL RETURNING party_id`;
  return rows.length > 0;
}

export async function joinParty(partyId: string, userId: string, deviceId: string): Promise<string | null> {
  const party = await openParty(partyId);
  if (!party || !(await hostOnline(party))) return "This listening party has ended.";
  if (party.hostId === userId) return "You're hosting this listening party.";
  if (!isDeviceId(deviceId)) return "This device can't join.";
  const mine = await listDevices(userId);
  if (!mine.some((device) => device.id === deviceId)) return "This device isn't online yet. Try again in a moment.";
  await endParty(userId);
  await leaveParty(userId);
  await sql`
    INSERT INTO party_members (party_id, user_id, device_id) VALUES (${partyId}, ${userId}, ${deviceId})
    ON CONFLICT (party_id, user_id) DO UPDATE
      SET device_id = EXCLUDED.device_id, left_at = NULL, joined_at = now(),
          sent_track = NULL, sent_playing = NULL, sent_at = NULL`;
  const device = await hostDevice(party);
  await bringGuest(party, { userId, deviceId, sentTrack: null, sentPlaying: null, sentAt: null }, device, Date.now());
  return null;
}

export async function hostReported(hostId: string, device: Device) {
  const party = await hostedParty(hostId);
  if (!party) return;
  if (device.id !== party.deviceId) {
    if (!device.state.playing) return;
    party.deviceId = device.id;
    await sql`UPDATE parties SET device_id = ${device.id} WHERE id = ${party.id}`;
  }
  const now = Date.now();
  const track = device.state.track;
  const trackId = track?.trackId ?? null;
  const expected = hostTime(party, now);
  const jumped =
    trackId !== null && trackId === party.trackId && party.playing === device.state.playing
      ? Math.abs(expected - device.state.time) > SEEK_JUMP_SECONDS
      : false;
  party.trackId = trackId;
  party.playing = device.state.playing;
  party.position = device.state.time;
  party.positionAt = now;
  await sql`
    UPDATE parties SET track_id = ${trackId}, playing = ${device.state.playing}, position = ${device.state.time},
                    position_at = now()
    WHERE id = ${party.id}`;
  await noteSongs(party, [track?.songId]);
  for (const member of await guests(party.id)) {
    const step = stepForGuest(
      { trackId, playing: device.state.playing, time: device.state.time, jumped },
      { sentTrack: member.sentTrack, sentPlaying: member.sentPlaying },
    );
    await apply(party, member, step, track, device.state.duration);
  }
}

export async function guestReported(userId: string, device: Device) {
  const found = await guestParty(userId);
  if (!found || found.member.deviceId !== device.id) return;
  const { party, member } = found;
  const now = Date.now();
  const settled = member.sentAt === null || now - member.sentAt > SETTLE_MS;
  const track = device.state.track;
  if (settled && track && member.sentTrack && track.trackId !== member.sentTrack && track.trackId !== party.trackId) {
    await leaveParty(userId);
    return;
  }
  if (!party.playing || !device.state.playing || track?.trackId !== party.trackId) return;
  if (member.sentAt !== null && now - member.sentAt < CORRECT_EVERY_MS) return;
  const target = hostTime(party, now);
  if (!drifted(target, device.state.time)) return;
  await apply(party, member, { kind: "seek", time: target }, track, device.state.duration);
}

export async function deviceReported(userId: string, device: Device) {
  await hostReported(userId, device);
  await guestReported(userId, device);
}

async function names(partyId: string, trackIds: string[]) {
  if (trackIds.length === 0) return new Map<string, string>();
  const rows = await sql`
    SELECT DISTINCT ON (track_id) track_id, user_id FROM party_adds
    WHERE party_id = ${partyId} AND track_id = ANY(${trackIds})
    ORDER BY track_id, added_at DESC`;
  return new Map(rows.map((row) => [row.track_id as string, row.user_id as string]));
}

export async function currentParty(userId: string): Promise<PartyView | null> {
  const hosted = await hostedParty(userId);
  const found = hosted
    ? { party: hosted, role: "host" as const }
    : await guestParty(userId).then((guest) => (guest ? { party: guest.party, role: "guest" as const } : null));
  if (!found) return null;
  const { party, role } = found;
  if (!(await hostOnline(party))) {
    await sql`UPDATE parties SET ended_at = now() WHERE id = ${party.id}`;
    await sql`UPDATE party_members SET left_at = now() WHERE party_id = ${party.id} AND left_at IS NULL`;
    return null;
  }
  return describe(party, role);
}

export async function partyFor(partyId: string, userId: string): Promise<PartyView | null> {
  const party = await openParty(partyId);
  if (!party || !(await hostOnline(party))) return null;
  const [member] = await sql`
    SELECT 1 FROM party_members WHERE party_id = ${partyId} AND user_id = ${userId} AND left_at IS NULL`;
  return describe(party, party.hostId === userId ? "host" : member ? "guest" : "visitor");
}

async function describe(party: PartyRow, role: PartyRole): Promise<PartyView> {
  const device = await hostDevice(party);
  const upNext = device?.state.upNext ?? [];
  const adders = await names(
    party.id,
    upNext.map((next) => next.trackId),
  );
  const members = await guests(party.id);
  const track = device?.state.track ?? null;
  return {
    id: party.id,
    host: party.hostId,
    role,
    guests: members.map((member) => member.userId),
    track: track ? { ...track, cover: partyCover(party.id, track.cover) } : null,
    playing: Boolean(device?.state.playing),
    upNext: upNext.map((next) => ({ ...next, addedBy: adders.get(next.trackId) ?? null })),
  };
}

export async function addToParty(
  partyId: string,
  userId: string,
  track: HandedTrack,
  next: boolean,
): Promise<string | null> {
  const party = await openParty(partyId);
  if (!party) return "This listening party has ended.";
  if (party.hostId !== userId) {
    const [member] = await sql`
      SELECT 1 FROM party_members WHERE party_id = ${partyId} AND user_id = ${userId} AND left_at IS NULL`;
    if (!member) return "Join the listening party to add songs.";
  }
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM party_adds
    WHERE party_id = ${partyId} AND user_id = ${userId} AND added_at > now() - ${ADDS_WINDOW}::interval`;
  if (count >= MOST_ADDS) return "You've added a lot of songs. Wait a few minutes.";
  const forHost = await inHostLibrary(party.hostId, track);
  await noteSongs(party, [forHost.songId]);
  await sql`INSERT INTO party_adds (party_id, track_id, user_id) VALUES (${partyId}, ${track.trackId}, ${userId})`;
  if (!(await sendCommand(party.hostId, party.deviceId, { do: "enqueue", track: forHost, next }))) {
    return "The host's player isn't reachable right now.";
  }
  return null;
}

async function inHostLibrary(hostId: string, track: HandedTrack): Promise<HandedTrack> {
  const { songId: _theirs, cover, ...rest } = track;
  const plain: HandedTrack = {
    ...rest,
    ...(cover && !cover.startsWith(NAVIDROME_COVER) && !cover.startsWith("/api/party/") ? { cover } : {}),
  };
  try {
    const server = await getNavidrome(hostId);
    if (!server) return plain;
    const found = await findLibrarySong(server, { trackId: track.trackId, title: track.title, artist: track.artist });
    if (!found) return plain;
    return {
      ...plain,
      songId: found.id,
      ...(found.coverArt && isSongId(found.coverArt) ? { cover: `${NAVIDROME_COVER}${found.coverArt}` } : {}),
    };
  } catch {
    return plain;
  }
}

export async function canStream(userId: string, partyId: string, songId: string): Promise<string | null> {
  const party = await openParty(partyId);
  if (!party) return null;
  if (party.hostId !== userId) {
    const [member] = await sql`
      SELECT 1 FROM party_members WHERE party_id = ${partyId} AND user_id = ${userId} AND left_at IS NULL`;
    if (!member) return null;
  }
  return party.songs.includes(songId) ? party.hostId : null;
}

export async function partyHostFor(userId: string, partyId: string): Promise<string | null> {
  const party = await openParty(partyId);
  if (!party) return null;
  if (party.hostId === userId) return party.hostId;
  const [member] = await sql`
    SELECT 1 FROM party_members WHERE party_id = ${partyId} AND user_id = ${userId} AND left_at IS NULL`;
  return member ? party.hostId : null;
}
