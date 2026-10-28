"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/accounts";
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from "@/lib/live";
import { deleteAllPlays } from "@/lib/play-edits";
import { logOut, logOutOtherDevices, requireUserId } from "@/lib/session";
import { createInvite, signupMode } from "@/lib/signups";
import { changePassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/users";

export type DeleteHistoryState = { error?: string; deleted?: number };

export async function deleteHistory(_previous: DeleteHistoryState, formData: FormData): Promise<DeleteHistoryState> {
  const userId = await requireUserId();
  if (await isLoginLocked(userId)) return { error: "Too many wrong passwords. Try again in 15 minutes." };
  if (!(await verifyPassword(userId, String(formData.get("password") ?? "")))) {
    await recordLoginFailure(userId);
    return { error: "Incorrect password." };
  }
  await clearLoginFailures(userId);
  const deleted = await deleteAllPlays(userId);
  revalidatePath("/", "layout");
  return { deleted };
}

export type DeleteAccountState = { error?: string };

export async function deleteMyAccount(_previous: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const userId = await requireUserId();
  if (
    String(formData.get("username") ?? "")
      .trim()
      .toLowerCase() !== userId
  )
    return { error: `Type your username, ${userId}, to confirm.` };
  if (await isLoginLocked(userId)) return { error: "Too many wrong passwords. Try again in 15 minutes." };
  if (!(await verifyPassword(userId, String(formData.get("password") ?? "")))) {
    await recordLoginFailure(userId);
    return { error: "Incorrect password." };
  }
  await deleteAccount(userId);
  await logOut();
  redirect("/?deleted=1");
}

export type ChangePasswordState = { error?: string };

export async function changeMyPassword(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const userId = await requireUserId();
  const next = String(formData.get("newPassword") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH)
    return { error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (next !== String(formData.get("confirmPassword") ?? "")) return { error: "The two new passwords don't match." };
  if (await isLoginLocked(userId)) return { error: "Too many wrong passwords. Try again in 15 minutes." };
  if (!(await verifyPassword(userId, String(formData.get("password") ?? "")))) {
    await recordLoginFailure(userId);
    return { error: "Incorrect password." };
  }
  await clearLoginFailures(userId);
  await changePassword(userId, next);
  await logOutOtherDevices(userId);
  redirect("/settings?password=changed");
}

export type InviteState = { error?: string; code?: string };

export async function createInviteLink(): Promise<InviteState> {
  const userId = await requireUserId();
  if (signupMode() !== "invite") return { error: "This server isn't using invite links." };
  return { code: await createInvite(userId) };
}
