import { getListening, getRecent } from "./live";
import { isPrivate } from "./privacy";
import { userExists } from "./users";

export type NowPlaying =
  | { state: "now" | "last"; title: string; artist: string; cover?: string; at?: Date }
  | { state: "nothing" | "private" | "missing" };

export async function nowPlaying(username: string): Promise<NowPlaying> {
  if (!(await userExists(username))) return { state: "missing" };
  if (await isPrivate(username)) return { state: "private" };
  const listening = await getListening(username);
  if (listening) {
    return {
      state: "now",
      title: listening.title,
      artist: listening.artist,
      ...(listening.cover ? { cover: listening.cover } : {}),
    };
  }
  const [last] = await getRecent(username, 1);
  if (!last) return { state: "nothing" };
  return {
    state: "last",
    title: last.title,
    artist: last.artist,
    ...(last.cover ? { cover: last.cover } : {}),
    at: new Date(last.playedAt),
  };
}
