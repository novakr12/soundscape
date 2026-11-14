"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { fillCoversFromNavidrome, forgetNavidromeCovers } from "@/lib/covers";
import { JellyfinError, removeJellyfin, saveJellyfin } from "@/lib/jellyfin";
import { removeLastfmScrobbling } from "@/lib/lastfm-scrobble";
import { NavidromeError, removeNavidrome, saveNavidrome } from "@/lib/navidrome";
import { RelayError, removeRelay, saveRelay } from "@/lib/relay";
import { requireUserId } from "@/lib/session";
import { createToken, revokeToken, TokenError } from "@/lib/tokens";

export type TokenFormState = { error?: string; token?: string; name?: string };

export async function createDeviceToken(_previous: TokenFormState, formData: FormData): Promise<TokenFormState> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "");
  try {
    const token = await createToken(userId, name);
    revalidatePath("/connect");
    return { token, name: name.replace(/\s+/g, " ").trim() };
  } catch (error) {
    if (error instanceof TokenError) return { error: error.message };
    throw error;
  }
}

export async function revokeDeviceToken(formData: FormData) {
  const userId = await requireUserId();
  await revokeToken(userId, Number(formData.get("id")));
  revalidatePath("/connect");
}

export type RelayFormState = {
  error?: string;
};

export type NavidromeFormState = {
  error?: string;
  url?: string;
  username?: string;
};

export async function connectNavidrome(_previous: NavidromeFormState, formData: FormData): Promise<NavidromeFormState> {
  const userId = await requireUserId();
  const url = String(formData.get("url") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!url || !username || !password) return { error: "Fill in the address, username and password.", url, username };

  try {
    await saveNavidrome(userId, url, username, password);
  } catch (error) {
    if (error instanceof NavidromeError) return { error: error.message, url, username };
    throw error;
  }
  after(() => fillCoversFromNavidrome(userId, 500));
  revalidatePath("/connect");
  revalidatePath("/mixes");
  return {};
}

export async function disconnectNavidrome() {
  const userId = await requireUserId();
  await removeNavidrome(userId);
  await forgetNavidromeCovers(userId);
  revalidatePath("/connect");
  revalidatePath("/mixes");
}

export type JellyfinFormState = {
  error?: string;
  url?: string;
  username?: string;
};

export async function connectJellyfin(_previous: JellyfinFormState, formData: FormData): Promise<JellyfinFormState> {
  const userId = await requireUserId();
  const url = String(formData.get("url") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  if (!url || !apiKey || !username) return { error: "Fill in the address, API key and username.", url, username };

  try {
    await saveJellyfin(userId, url, apiKey, username);
  } catch (error) {
    if (error instanceof JellyfinError) return { error: error.message, url, username };
    throw error;
  }
  revalidatePath("/connect");
  return {};
}

export async function disconnectJellyfin() {
  await removeJellyfin(await requireUserId());
  revalidatePath("/connect");
}

export async function startRelay(_previous: RelayFormState, formData: FormData): Promise<RelayFormState> {
  const userId = await requireUserId();
  const token = String(formData.get("listenBrainzToken") ?? "").trim();
  if (!token) return { error: "Paste your ListenBrainz user token." };

  try {
    await saveRelay(userId, token);
  } catch (error) {
    if (error instanceof RelayError) return { error: error.message };
    throw error;
  }
  revalidatePath("/connect");
  return {};
}

export async function stopRelay() {
  await removeRelay(await requireUserId());
  revalidatePath("/connect");
}

export async function stopLastfm() {
  await removeLastfmScrobbling(await requireUserId());
  revalidatePath("/connect");
}
