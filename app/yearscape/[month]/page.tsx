import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DailyPlaysChart } from "@/components/stats-charts";
import { requireUserId } from "@/lib/session";
import { formatListeningTime, localDay } from "@/lib/time";
import { getMonthscape } from "@/lib/yearscape";
import Discoveries from "../discoveries";
import ScapeSummary, { plural } from "../scape-summary";

type Props = { params: Promise<{ month: string }> };

const monthLabel = (month: string, withYear = true) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });

async function validMonth(params: Props["params"]) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2000-01" || month > localDay(new Date()).slice(0, 7)) {
    notFound();
  }
  return month;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${monthLabel(await validMonth(params))} · Soundscape` };
}

export default async function MonthscapePage({ params }: Props) {
  const month = await validMonth(params);
  const userId = await requireUserId();
  const scape = await getMonthscape(userId, month);
  const year = month.slice(0, 4);

  const tiles = [
    { label: "Plays", value: scape.plays.toLocaleString("en") },
    { label: "Listening time", value: formatListeningTime(scape.listeningMs) },
    { label: "Days listened", value: scape.days.filter((day) => day.plays > 0).length.toLocaleString("en") },
    { label: "Artists", value: scape.artists.toLocaleString("en") },
    { label: "Songs", value: scape.songs.toLocaleString("en") },
    { label: "New artists", value: scape.newArtists.length.toLocaleString("en") },
  ];

  return (
    <>
      <p className="muted">
        <Link href={`/yearscape?year=${year}`}>{year} Yearscape</Link>
      </p>
      <h1>Your {monthLabel(month)}</h1>
      <nav className="year-links" aria-label="Months">
        {scape.previous && <Link href={`/yearscape/${scape.previous}`}>‹ {monthLabel(scape.previous, false)}</Link>}
        {scape.next && <Link href={`/yearscape/${scape.next}`}>{monthLabel(scape.next, false)} ›</Link>}
      </nav>

      {scape.plays === 0 ? (
        <p className="muted">No plays in {monthLabel(month)}.</p>
      ) : (
        <>
          <div className="tiles stats-tiles">
            {tiles.map((tile) => (
              <div key={tile.label} className="tile">
                <span className="muted">{tile.label}</span>
                <strong>{tile.value}</strong>
              </div>
            ))}
          </div>

          <ScapeSummary scape={scape} />

          <section className="chart-card">
            <h2>Day by day</h2>
            <DailyPlaysChart data={scape.days} />
          </section>

          <section>
            <h2>New discoveries</h2>
            {scape.newArtists.length === 0 ? (
              <p className="muted">Every artist you played this month was one you already knew.</p>
            ) : (
              <>
                <p>
                  You discovered <strong>{plural(scape.newArtists.length, "new artist")}</strong> in{" "}
                  {monthLabel(month, false)}.
                </p>
                <Discoveries artists={scape.newArtists} showMonth={false} />
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
