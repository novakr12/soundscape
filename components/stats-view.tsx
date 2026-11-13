import AlbumList from "@/components/album-list";
import ListeningHeatmap from "@/components/listening-heatmap";
import { ArtistLink } from "@/components/music-links";
import { DailyPlaysChart, ListeningClockChart, RankedBarChart } from "@/components/stats-charts";
import { topAlbums } from "@/lib/albums";
import { getListeningClock, type ListeningClock } from "@/lib/listening-clock";
import {
  getListeningHeatmap,
  getListeningTime,
  getPlaysPerDay,
  getTopArtists,
  getTopGenres,
  getTotals,
  type RankedItem,
} from "@/lib/stats";
import { formatListeningTime, TIME_ZONE, WEEKDAYS } from "@/lib/time";

function heatmapSummary(grid: number[][]) {
  let best = { day: 0, hour: 0, plays: -1 };
  grid.forEach((row, day) => {
    row.forEach((plays, hour) => {
      if (plays > best.plays) best = { day, hour, plays };
    });
  });
  return `You listen most on ${WEEKDAYS[best.day]}s around ${String(best.hour).padStart(2, "0")}:00.`;
}

function HeatmapTable({ grid }: { grid: number[][] }) {
  return (
    <details>
      <summary className="muted">Show as table</summary>
      <div className="table-scroll">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th>Day</th>
              {grid[0].map((_, hour) => (
                <th key={hour}>{String(hour).padStart(2, "0")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, day) => (
              <tr key={day}>
                <td>{WEEKDAYS[day].slice(0, 3)}</td>
                {row.map((plays, hour) => (
                  <td key={hour}>{plays}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const clockHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const share = (value: number) => `${Math.round(value * 1000) / 10}%`;

function clockSummary(clock: ListeningClock) {
  const article = clock.kind === "early bird" || clock.kind === "evening listener" ? "an" : "a";
  const parts = [
    `Your busiest hour is ${clockHour(clock.peakHour)}, so you're ${article} ${clock.kind}.`,
    `${clock.busiestDay} is your busiest day, and ${Math.round(clock.weekendShare * 100)}% of your plays are at the weekend.`,
  ];
  if (clock.followingPeakHour !== undefined) {
    parts.push(`People you follow listen most at ${clockHour(clock.followingPeakHour)}.`);
  }
  return parts.join(" ");
}

function ClockTable({ clock }: { clock: ListeningClock }) {
  const comparing = clock.followingPeakHour !== undefined;
  return (
    <details>
      <summary className="muted">Show as table</summary>
      <table>
        <thead>
          <tr>
            <th>Hour</th>
            <th>You</th>
            {comparing && <th>People you follow</th>}
          </tr>
        </thead>
        <tbody>
          {clock.hours.map((hour) => (
            <tr key={hour.hour}>
              <td>{clockHour(hour.hour)}</td>
              <td>{share(hour.you)}</td>
              {comparing && <td>{share(hour.following ?? 0)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function DataTable({ rows, label, artists = false }: { rows: RankedItem[]; label: string; artists?: boolean }) {
  return (
    <details>
      <summary className="muted">Show as table</summary>
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th>Plays</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{artists ? <ArtistLink name={row.name} /> : row.name}</td>
              <td>{row.plays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default async function StatsView({ userId }: { userId: string }) {
  const [daily, totals, artists, genres, time, heatmap, albums] = await Promise.all([
    getPlaysPerDay(userId),
    getTotals(userId),
    getTopArtists(userId),
    getTopGenres(userId),
    getListeningTime(userId),
    getListeningHeatmap(userId),
    topAlbums(userId),
  ]);
  const yearPlays = heatmap.flat().reduce((sum, plays) => sum + plays, 0);
  const clock = await getListeningClock(userId, heatmap);
  const last30 = daily.reduce((sum, d) => sum + d.plays, 0);

  const tiles = [
    { label: "Plays in the last 30 days", value: last30.toLocaleString("en") },
    { label: "Listening time, last 30 days", value: formatListeningTime(time.recent.ms) },
    { label: "Artists", value: totals.artists.toLocaleString("en") },
    { label: "Plays all time", value: totals.plays.toLocaleString("en") },
    { label: "Listening time, all time", value: formatListeningTime(time.allTime.ms) },
    { label: "Tracks", value: totals.tracks.toLocaleString("en") },
  ];
  const knownShare = Math.min(time.recent.knownShare, time.allTime.knownShare);

  return (
    <>
      <div className="tiles stats-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value}</strong>
          </div>
        ))}
      </div>
      {knownShare < 1 && (
        <p className="muted tiles-note">
          Song length is known for {Math.floor(knownShare * 100)}% of plays. The rest count as your average song length.
        </p>
      )}

      <section className="chart-card">
        <h2>Plays per day</h2>
        <p className="muted">Last 30 days.</p>
        {last30 === 0 ? <p className="muted">No plays in the last 30 days.</p> : <DailyPlaysChart data={daily} />}
        <DataTable rows={daily.map((d) => ({ name: d.day, plays: d.plays }))} label="Day" />
      </section>

      <section className="chart-card">
        <h2>When you listen</h2>
        <p className="muted">Past 12 months by weekday and hour, in {TIME_ZONE.replace("_", " ")} time.</p>
        {yearPlays === 0 ? (
          <p className="muted">No plays in the past 12 months.</p>
        ) : (
          <>
            <p>{heatmapSummary(heatmap)}</p>
            <ListeningHeatmap grid={heatmap} summary={heatmapSummary(heatmap)} />
          </>
        )}
        <HeatmapTable grid={heatmap} />
      </section>

      {clock && (
        <section className="chart-card">
          <h2>Listening clock</h2>
          <p className="muted">
            Share of your plays in each hour of the day, past 12 months
            {clock.following > 0 &&
              `, next to the average of ${clock.following} ${clock.following === 1 ? "person" : "people"} you follow`}
            .
          </p>
          <p>{clockSummary(clock)}</p>
          <ListeningClockChart data={clock.hours} />
          <ClockTable clock={clock} />
        </section>
      )}

      <div className="columns">
        <section className="chart-card">
          <h2>Top artists</h2>
          <p className="muted">All time.</p>
          {artists.length === 0 ? <p className="muted">No plays yet.</p> : <RankedBarChart data={artists} />}
          <DataTable rows={artists} label="Artist" artists />
        </section>

        <section className="chart-card">
          <h2>Top genres</h2>
          <p className="muted">
            All time, using each artist&apos;s genres from MusicBrainz.
            {genres.coverage > 0 && genres.coverage < 1 && (
              <> Genres are known for {Math.round(genres.coverage * 100)}% of these plays.</>
            )}
          </p>
          {genres.genres.length === 0 ? (
            <p className="muted">No genre data yet.</p>
          ) : (
            <RankedBarChart data={genres.genres} />
          )}
          <DataTable rows={genres.genres} label="Genre" />
        </section>
      </div>

      {albums.length > 0 && (
        <section>
          <h2>Top albums</h2>
          <p className="muted">All time.</p>
          <AlbumList albums={albums} />
        </section>
      )}
    </>
  );
}
