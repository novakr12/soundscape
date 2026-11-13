"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { findDuplicatePlays, removeDuplicatePlays, usersWithPlays } from "@/lib/dedupe";
import { clearErrors } from "@/lib/errors";
import { LibraryEditError, mergeArtist, mergeSong, renameArtist, renameSong } from "@/lib/library-edits";
import { currentUserId } from "@/lib/session";

export async function clearServerErrors() {
  if (!(await allowed())) return;
  await clearErrors();
  revalidatePath("/admin");
}

export type DuplicatesResult = { error?: string; users?: { username: string; duplicates: number }[]; removed?: number };

async function allowed() {
  return isAdmin(await currentUserId());
}

async function duplicatesByUser() {
  const found = [];
  for (const username of await usersWithPlays()) {
    const duplicates = await findDuplicatePlays(username);
    if (duplicates.length > 0) found.push({ username, duplicates });
  }
  return found.sort((a, b) => a.username.localeCompare(b.username));
}

export async function findDuplicates(): Promise<DuplicatesResult> {
  if (!(await allowed())) return { error: "Only admins can do this." };
  const found = await duplicatesByUser();
  return { users: found.map(({ username, duplicates }) => ({ username, duplicates: duplicates.length })) };
}

export async function removeDuplicates(): Promise<DuplicatesResult> {
  if (!(await allowed())) return { error: "Only admins can do this." };
  let removed = 0;
  for (const { username, duplicates } of await duplicatesByUser()) {
    removed += await removeDuplicatePlays(username, duplicates);
  }
  return { users: [], removed };
}

export type LibraryEditResult = { error?: string; path?: string };

async function libraryEdit(work: () => Promise<string>, path: (id: string) => string): Promise<LibraryEditResult> {
  if (!(await allowed())) return { error: "Only admins can do this." };
  try {
    const id = await work();
    revalidatePath("/", "layout");
    return { path: path(id) };
  } catch (error) {
    if (error instanceof LibraryEditError) return { error: error.message };
    throw error;
  }
}

const artistPath = (id: string) => `/artist/${encodeURIComponent(id)}`;
const songPath = (id: string) => `/track/${encodeURIComponent(id)}`;

export async function renameArtistAction(artistId: string, name: string) {
  return libraryEdit(() => renameArtist(String(artistId), String(name)), artistPath);
}

export async function mergeArtistAction(artistId: string, into: string) {
  return libraryEdit(() => mergeArtist(String(artistId), String(into)), artistPath);
}

export async function renameSongAction(trackId: string, title: string) {
  return libraryEdit(() => renameSong(String(trackId), String(title)), songPath);
}

export async function mergeSongAction(trackId: string, intoId: string) {
  return libraryEdit(() => mergeSong(String(trackId), String(intoId)), songPath);
}
