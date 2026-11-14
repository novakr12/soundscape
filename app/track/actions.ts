"use server";

import { revalidatePath } from "next/cache";
import { setLoved } from "@/lib/loved";
import { requireUserId } from "@/lib/session";

export async function loveAction(trackId: string, loved: boolean): Promise<string | null> {
  const userId = await requireUserId();
  const done = await setLoved(userId, String(trackId), Boolean(loved));
  revalidatePath(`/track/${encodeURIComponent(trackId)}`);
  revalidatePath(`/u/${encodeURIComponent(userId)}`);
  return done ? null : "That song isn't in Soundscape.";
}
