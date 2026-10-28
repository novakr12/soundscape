"use server";

import { redirect } from "next/navigation";
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from "@/lib/live";
import { logIn } from "@/lib/session";
import { verifyPassword } from "@/lib/users";

export type LoginState = {
  username?: string;
  error?: string;
};

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { username, error: "Wrong username or password." };

  if (await isLoginLocked(username)) {
    return { username, error: "Too many failed attempts. Try again in 15 minutes." };
  }
  if (!(await verifyPassword(username, password))) {
    await recordLoginFailure(username);
    return { username, error: "Wrong username or password." };
  }
  await clearLoginFailures(username);
  await logIn(username);
  redirect("/");
}
