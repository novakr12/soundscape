import AlbumList from "@/components/album-list";
import ListeningHeatmap from "@/components/listening-heatmap";
import { ArtistLink } from "@/components/music-links";
import { DailyPlaysChart, RankedBarChart } from "@/components/stats-charts";
import { topAlbums } from "@/lib/albums";
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
