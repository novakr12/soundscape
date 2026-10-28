import Link from "next/link";
import { Lockup } from "@/components/logo";
import { signupMode } from "@/lib/signups";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <>
      <Lockup />
      <h1>Log in</h1>
      <LoginForm />
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
