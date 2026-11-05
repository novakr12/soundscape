"use server";

import { revalidatePath } from "next/cache";
import { markAllRead } from "@/lib/notifications";
import { requireUserId } from "@/lib/session";

export async function markNotificationsRead() {
  await markAllRead(await requireUserId());
  revalidatePath("/", "layout");
}
