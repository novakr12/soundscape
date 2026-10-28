import StatsView from "@/components/stats-view";
import { requireUserId } from "@/lib/session";

export default async function StatsPage() {
  const userId = await requireUserId();

  return (
    <>
      <h1>Your stats</h1>
      <StatsView userId={userId} />
    </>
  );
}
