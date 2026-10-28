"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { findMissingCovers } from "@/lib/covers";
import { deletePlay, deletePlays, editPlay, MAX_PLAYS_PER_DELETE } from "@/lib/play-edits";
import { requireUserId } from "@/lib/session";

const MAX_LENGTH = 200;

export type PlayRef = { playId: string; playedAt: string };

function keyFor(play: PlayRef) {
  return { playId: String(play.playId), playedAt: new Date(String(play.playedAt)) };
}

export async function deletePlayAction(play: PlayRef): Promise<string | null> {
  const userId = await requireUserId();
  const deleted = await deletePlay(userId, keyFor(play));
  revalidatePath("/history");
  return deleted ? null : "This play no longer exists.";
}

export async function deletePlaysAction(plays: PlayRef[]): Promise<string | null> {
  const userId = await requireUserId();
  if (!Array.isArray(plays) || plays.length === 0) return "Select at least one play.";
  if (plays.length > MAX_PLAYS_PER_DELETE) return `Delete at most ${MAX_PLAYS_PER_DELETE} plays at once.`;
  const deleted = await deletePlays(userId, plays.map(keyFor));
  revalidatePath("/history");
  return deleted === plays.length ? null : `${plays.length - deleted} of those plays no longer existed.`;
}

export async function editPlayAction(play: PlayRef, artist: string, title: string): Promise<string | null> {
  const userId = await requireUserId();
  const cleanArtist = String(artist ?? "").trim();
  const cleanTitle = String(title ?? "").trim();
  if (!cleanArtist || !cleanTitle) return "Artist and title can't be empty.";
  if (cleanArtist.length > MAX_LENGTH || cleanTitle.length > MAX_LENGTH) {
    return `Artist and title must be at most ${MAX_LENGTH} characters.`;
  }

  const result = await editPlay(userId, keyFor(play), cleanArtist, cleanTitle);
  revalidatePath("/history");
  if (!result) return "This play no longer exists.";
  after(() => findMissingCovers(userId, result.catalogNodesCreated > 0));
  return null;
}
