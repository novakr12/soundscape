"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/session";
import { createToken, TokenError } from "@/lib/tokens";
import { deviceName } from "./device";

export type ConnectResult = { token?: string; user?: string; error?: string };

export async function connectDesktop(device: string): Promise<ConnectResult> {
  const userId = await requireUserId();
  try {
    const token = await createToken(userId, deviceName(device));
    revalidatePath("/connect");
    return { token, user: userId };
  } catch (error) {
    if (error instanceof TokenError) return { error: error.message };
    throw error;
  }
}
