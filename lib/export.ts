import { sql } from "./postgres";

export type ExportedPlay = { playedAt: string; artist: string; title: string; trackId: string };

export type ExportFormat = "json" | "csv";

const EXPORT_BATCH = 5000;

export async function* exportPlays(userId: string): AsyncGenerator<ExportedPlay> {
  const cursor = sql`
    SELECT p.played_at, a.name AS artist, t.title, p.track_id
    FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
    WHERE p.user_id = ${userId}
    ORDER BY p.played_at, p.id`.cursor(EXPORT_BATCH);
  for await (const rows of cursor) {
    for (const row of rows) {
      yield { playedAt: row.played_at.toISOString(), artist: row.artist, title: row.title, trackId: row.track_id };
    }
  }
}

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export async function* exportLines(userId: string, format: ExportFormat): AsyncGenerator<string> {
  if (format === "csv") {
    yield "played_at,artist,title,track_id\n";
    for await (const play of exportPlays(userId)) {
      yield `${[play.playedAt, play.artist, play.title, play.trackId].map(csvField).join(",")}\n`;
    }
    return;
  }
  let first = true;
  yield "[";
  for await (const play of exportPlays(userId)) {
    yield `${first ? "\n" : ",\n"}  ${JSON.stringify(play)}`;
    first = false;
  }
  yield first ? "]\n" : "\n]\n";
}
