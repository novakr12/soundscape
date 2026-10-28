import { Lockup } from "@/components/logo";
import { inviteUsable, signupMode } from "@/lib/signups";
import SignupForm from "./signup-form";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const mode = signupMode();
  const invite = (await searchParams).invite ?? "";
  const usable = mode === "invite" && (await inviteUsable(invite));

  return (
    <>
      <Lockup />
      <h1>Create an account</h1>
      {mode === "closed" ? (
        <p className="muted">Sign-ups are closed on this server. Ask the person who runs it for an account.</p>
      ) : mode === "invite" && !usable ? (
        <p className="muted">
          {invite
            ? "This invite link has already been used or has expired. Ask for a new one."
            : "This server is invite only. Ask someone who uses it for an invite link."}
        </p>
      ) : (
        <SignupForm invite={usable ? invite : undefined} />
      )}
    </>
  );
}
