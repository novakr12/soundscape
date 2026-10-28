import FollowList from "@/components/follow-list";

type Props = { params: Promise<{ username: string }> };

export default async function FollowingPage({ params }: Props) {
  const username = decodeURIComponent((await params).username).toLowerCase();
  return <FollowList username={username} kind="following" />;
}
