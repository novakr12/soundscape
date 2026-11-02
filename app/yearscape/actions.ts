"use server";

import { type SavedYear, saveYearToNavidrome } from "@/lib/mixes";
import { NavidromeError } from "@/lib/navidrome";
import { requireUserId } from "@/lib/session";

export type SaveYearState = { saved?: SavedYear; error?: string };

export async function saveYearPlaylist(year: number): Promise<SaveYearState> {
  const userId = await requireUserId();
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return { error: "That isn't a year." };
  try {
    return { saved: await saveYearToNavidrome(userId, year) };
  } catch (error) {
    if (error instanceof NavidromeError) return { error: error.message };
    throw error;
  }
}
