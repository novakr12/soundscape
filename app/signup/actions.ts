"use server";

import { claimInvite, releaseInvite, signupMode } from "@/lib/signups";
import { createUser, MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from "@/lib/users";

export type SignupState = {
  username?: string;
  error?: string;
  created?: string;
};

export async function signup(_previous: SignupState, formData: FormData): Promise<SignupState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!USERNAME_PATTERN.test(username)) {
    return { username, error: "Username must be 3–20 characters: lowercase letters, digits or _." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { username, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const mode = signupMode();
  if (mode === "closed") return { username, error: "Sign-ups are closed on this server." };
  const invite = String(formData.get("invite") ?? "");
  if (mode === "invite" && !(await claimInvite(invite, username))) {
    return { username, error: "This invite link has already been used or has expired." };
  }

  const created = await createUser(username, password);
  if (!created) {
    if (mode === "invite") await releaseInvite(invite, username);
    return { username, error: `The username ${username} is already taken.` };
  }

  return { created: username };
}
