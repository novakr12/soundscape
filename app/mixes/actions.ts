"use server";

import { revalidatePath } from "next/cache";
import { checkWantedInNavidrome, type MixKind, type SavedMix, saveMixToNavidrome } from "@/lib/mixes";
import { type LibrarySong, NavidromeError } from "@/lib/navidrome";
import { requireUserId } from "@/lib/session";
import { addWanted, removeWanted } from "@/lib/wanted";

export type SaveMixState = { saved?: SavedMix; error?: string };
export type CheckWantedState = { arrived?: LibrarySong[]; error?: string };

async function withNavidrome<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NavidromeError) return { error: error.message };
    throw error;
  }
}

export async function saveMix(kind: MixKind): Promise<SaveMixState> {
  const userId = await requireUserId();
  if (kind !== "discover" && kind !== "rediscover") return { error: "Unknown mix." };
  const result = await withNavidrome(async () => ({ saved: await saveMixToNavidrome(userId, kind) }));
  revalidatePath("/mixes");
  return result;
}

export async function checkWanted(): Promise<CheckWantedState> {
  const userId = await requireUserId();
  const result = await withNavidrome(async () => ({ arrived: await checkWantedInNavidrome(userId) }));
  revalidatePath("/mixes");
  return result;
}

export async function setWanted(trackId: string, wanted: boolean) {
  const userId = await requireUserId();
  if (wanted) await addWanted(userId, trackId);
  else await removeWanted(userId, [trackId]);
  revalidatePath("/mixes");
}
