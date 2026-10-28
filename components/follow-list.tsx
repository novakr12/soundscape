import Link from "next/link";
import { notFound } from "next/navigation";
import { listFollowers, listFollowing } from "@/lib/follows";
import { isPrivate, privateUsers } from "@/lib/privacy";
import { currentUserId } from "@/lib/session";
import { userExists } from "@/lib/users";

type Props = { username: string; kind: "followers" | "following" };

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default async function FollowList({ username, kind }: Props) {
  const [exists, viewer, hidden] = await Promise.all([userExists(username), currentUserId(), isPrivate(username)]);
  if (!exists) notFound();

  const back = (
    <p className="muted">
      <Link href={`/u/${encodeURIComponent(username)}`}>← {username}</Link>
    </p>
  );
  if (hidden && viewer !== username) {
    return (
      <>
        {back}
        <h1>{username}</h1>
        <p className="muted">This profile is private.</p>
      </>
    );
  }

  const users = kind === "followers" ? await listFollowers(username) : await listFollowing(username);
  const privateOnes = await privateUsers(users);
  const visible = users.filter((user) => !privateOnes.has(user) || user === viewer);
  const privateCount = users.length - visible.length;

  return (
    <>
      {back}
      <h1>{kind === "followers" ? `${username}'s followers` : `${username} follows`}</h1>
      {users.length === 0 ? (
        <p className="muted">
          {kind === "followers" ? `Nobody follows ${username} yet.` : `${username} doesn't follow anyone yet.`}
        </p>
      ) : (
        <>
          <ul>
            {visible.map((user) => (
              <li key={user}>
                <Link href={`/u/${encodeURIComponent(user)}`}>{user}</Link>
              </li>
            ))}
          </ul>
          {privateCount > 0 && (
            <p className="muted">
              {visible.length > 0 ? "and " : ""}
              {plural(privateCount, "private user")}
            </p>
          )}
        </>
      )}
    </>
  );
}
