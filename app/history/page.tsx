import HistoryView from "@/components/history-view";
import { requireUserId } from "@/lib/session";

type Props = {
  searchParams: Promise<{ month?: string; page?: string }>;
};

export default async function HistoryPage({ searchParams }: Props) {
  const userId = await requireUserId();
  const { month, page } = await searchParams;

  return (
    <>
      <h1>Listening history</h1>
      <HistoryView userId={userId} month={month} page={page} basePath="/history" editable />
    </>
  );
}
