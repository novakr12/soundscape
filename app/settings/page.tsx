import { revalidatePath } from "next/cache";
import Link from "next/link";
import { isPrivate, setPrivate } from "@/lib/privacy";
import { pushDeviceCount, vapidKeys } from "@/lib/push";
import { requireUserId } from "@/lib/session";
import { INVITE_DAYS, signupMode } from "@/lib/signups";
import ChangePasswordForm from "./change-password-form";
import DeleteAccountForm from "./delete-account-form";
import DeleteHistoryForm from "./delete-history-form";
import InviteForm from "./invite-form";
import NowPlayingShare from "./now-playing-share";
import PushSettings from "./push-settings";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const userId = await requireUserId();
  const { password } = await searchParams;
  const [hidden, keys, devices] = await Promise.all([isPrivate(userId), vapidKeys(), pushDeviceCount(userId)]);

  async function togglePrivacy() {
    "use server";
    const user = await requireUserId();
    await setPrivate(user, !(await isPrivate(user)));
    revalidatePath("/settings");
  }

  return (
    <>
      <h1>Settings</h1>

      <section>
        <h2>Privacy</h2>
        <p>
          Your profile is <strong>{hidden ? "private" : "public"}</strong>.{" "}
          {hidden
            ? "Only you can see your stats, what you're playing and your listening history."
            : "Anyone can see your stats, what you're playing and your listening history."}
        </p>
        <p className="muted">
          Either way, your plays count anonymously toward the charts and recommendations.{" "}
          <Link href={`/u/${userId}`}>View your profile</Link>
        </p>
        <form action={togglePrivacy}>
          <button type="submit">{hidden ? "Make profile public" : "Make profile private"}</button>
        </form>
      </section>

      <section>
        <h2>Notifications</h2>
        <p className="muted">
          Get a notification on your phone or computer when someone follows you, when a friend passes you on the weekly
          leaderboard and when you reach a play milestone. Turn it on separately on each device.
        </p>
        <PushSettings publicKey={keys.publicKey} devices={devices} />
      </section>

      <section>
        <h2>Now playing image</h2>
        <p className="muted">
          A small picture of what you&apos;re listening to, or the last song you played. Put it on a GitHub profile, a
          website or a forum signature; it updates whenever someone opens the page.
          {hidden && " Your profile is private, so the picture only says that."}
        </p>
        <NowPlayingShare username={userId} />
      </section>

      {signupMode() === "invite" && (
        <section>
          <h2>Invite a friend</h2>
          <p className="muted">This server is invite only. Each link lets one person create an account.</p>
          <InviteForm days={INVITE_DAYS} />
        </section>
      )}

      <section>
        <h2>Password</h2>
        <p className="muted">
          Changing it logs you out on your other devices. Your player keeps scrobbling, because it uses your API token.
        </p>
        <ChangePasswordForm changed={password === "changed"} />
      </section>

      <section className="danger-zone">
        <h2>Delete listening history</h2>
        <p>
          Removes every play you have, with your stats, Yearscape and your part of the charts. Your account, follows,
          connections and want list stay. This can&apos;t be undone.
        </p>
        <p className="muted">
          A ListenBrainz import starts from the beginning again afterwards. To delete only some plays, select them on
          the <Link href="/history">History</Link> page.
        </p>
        <DeleteHistoryForm />
      </section>

      <section className="danger-zone">
        <h2>Delete account</h2>
        <p>
          Removes your account and everything in it: every play, your follows and followers, your API token, your
          Navidrome and Jellyfin connections and your want list. Your username becomes free for anyone to take. This
          can&apos;t be undone.
        </p>
        <p className="muted">
          To keep a copy of your plays, <Link href="/export">export them</Link> first.
        </p>
        <DeleteAccountForm username={userId} />
      </section>
    </>
  );
}
