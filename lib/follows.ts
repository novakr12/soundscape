import { notifyFollow } from "./notifications";
import { sql } from "./postgres";
import { isPrivate } from "./privacy";
import { userExists } from "./users";

export type FollowCounts = { followers: number; following: number };

export async function follow(follower: string, followee: string): Promise<string | null> {
  if (follower === followee) return "You can't follow yourself.";
  if (!(await userExists(followee))) return "That user doesn't exist.";
  if (await isPrivate(followee)) return "This profile is private.";
  const added = await sql`
    INSERT INTO follows (follower, followee) VALUES (${follower}, ${followee}) ON CONFLICT DO NOTHING RETURNING 1`;
  if (added.length > 0) await notifyFollow(follower, followee);
  return null;
}

export async function unfollow(follower: string, followee: string) {
  await sql`DELETE FROM follows WHERE follower = ${follower} AND followee = ${followee}`;
}

export async function isFollowing(follower: string, followee: string): Promise<boolean> {
  const [row] = await sql`SELECT 1 FROM follows WHERE follower = ${follower} AND followee = ${followee}`;
  return Boolean(row);
}

export async function followCounts(userId: string): Promise<FollowCounts> {
  const [row] = await sql`
    SELECT (SELECT count(*) FROM follows WHERE followee = ${userId}) AS followers,
           (SELECT count(*) FROM follows WHERE follower = ${userId}) AS following`;
  return { followers: row.followers, following: row.following };
}

export async function listFollowers(userId: string): Promise<string[]> {
  const rows = await sql`SELECT follower FROM follows WHERE followee = ${userId} ORDER BY since DESC, follower`;
  return rows.map((row) => row.follower as string);
}

export async function listFollowing(userId: string): Promise<string[]> {
  const rows = await sql`SELECT followee FROM follows WHERE follower = ${userId} ORDER BY since DESC, followee`;
  return rows.map((row) => row.followee as string);
}
