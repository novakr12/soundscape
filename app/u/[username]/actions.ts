"use server";

import { revalidatePath } from "next/cache";
import { follow, unfollow } from "@/lib/follows";
import { requireUserId } from "@/lib/session";

export async function followAction(username: string): Promise<string | null> {
  const userId = await requireUserId();
  const target = String(username).toLowerCase();
  const problem = await follow(userId, target);
  revalidatePath(`/u/${target}`);
  return problem;
}

export async function unfollowAction(username: string): Promise<string | null> {
  const userId = await requireUserId();
  const target = String(username).toLowerCase();
  await unfollow(userId, target);
  revalidatePath(`/u/${target}`);
  return null;
}
