"use server";

import { isAdmin } from "@/lib/admin";
import { findDuplicatePlays, removeDuplicatePlays, usersWithPlays } from "@/lib/dedupe";
import { currentUserId } from "@/lib/session";

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
