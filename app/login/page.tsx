import Link from "next/link";
import { Lockup } from "@/components/logo";
import { safeNext } from "@/lib/safe-next";
import { signupMode } from "@/lib/signups";
import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, "");
  return (
    <>
      <Lockup />
      <h1>Log in</h1>
      <LoginForm next={next || undefined} />
      <p className="muted">
        {signupMode() === "open" ? (
          <>
            No account yet? <Link href="/signup">Sign up</Link>
          </>
        ) : signupMode() === "invite" ? (
          "No account yet? Ask someone who uses this server for an invite link."
        ) : (
          "Sign-ups are closed on this server."
        )}
      </p>
    </>
  );
}
