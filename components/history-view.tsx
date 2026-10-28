import Link from "next/link";
import HistoryTable from "@/components/history-table";
import { ArtistLink } from "@/components/music-links";
import TrackCell from "@/components/track-cell";
import { albumsFor } from "@/lib/albums";
import { coversFor, getHistory, monthLabel, shiftMonth } from "@/lib/history";
import { formatDateTime, monthBucket } from "@/lib/time";

const PAGE_SIZE = 200;

type Props = {
  userId: string;
  month?: string;
  page?: string;
  basePath: string;
  editable?: boolean;
};

export default async function HistoryView({
  userId,
  month: requested,
  page: requestedPage,
  basePath,
  editable = false,
}: Props) {
  const currentMonth = monthBucket(new Date());
  const month = requested && /^\d{4}-\d{2}$/.test(requested) && requested <= currentMonth ? requested : currentMonth;
  const page = Math.max(1, Math.min(Number.parseInt(requestedPage ?? "1", 10) || 1, 1000));

  const found = await getHistory(userId, month, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);
  const more = found.length > PAGE_SIZE;
  const plays = found.slice(0, PAGE_SIZE);
  const trackIds = plays.map((play) => play.trackId);
  const [covers, albums] = await Promise.all([coversFor(trackIds), albumsFor(trackIds)]);
  const link = (m: string, p = 1) => `${basePath}?month=${m}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <nav className="pager">
        <Link href={link(shiftMonth(month, -1))} scroll={false}>
          ← Previous
        </Link>
        <strong>{monthLabel(month)}</strong>
        {month < currentMonth ? (
          <Link href={link(shiftMonth(month, 1))} scroll={false}>
            Next →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {plays.length === 0 ? (
        <p className="muted">
          {page > 1 ? "No more plays" : "No plays"} in {monthLabel(month)}.
        </p>
      ) : editable ? (
        <HistoryTable
          key={`${month}-${page}`}
          plays={plays.map((play) => ({
            playId: play.playId,
            trackId: play.trackId,
            playedAt: play.playedAt.toISOString(),
            when: formatDateTime(play.playedAt),
            title: play.title,
            artist: play.artist,
            cover: covers.get(play.trackId),
            album: albums.get(play.trackId),
          }))}
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Played</th>
              <th>Track</th>
              <th>Artist</th>
            </tr>
          </thead>
          <tbody>
            {plays.map((play) => (
              <tr key={play.playId}>
                <td className="muted">{formatDateTime(play.playedAt)}</td>
                <td>
                  <TrackCell
                    trackId={play.trackId}
                    title={play.title}
                    cover={covers.get(play.trackId)}
                    album={albums.get(play.trackId)}
                  />
                </td>
                <td>
                  <ArtistLink name={play.artist} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(page > 1 || more) && (
        <nav className="pager pages" aria-label="Pages">
          {page > 1 ? (
            <Link href={link(month, page - 1)} scroll={false}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="muted">
            Plays {((page - 1) * PAGE_SIZE + 1).toLocaleString("en")}–
            {((page - 1) * PAGE_SIZE + plays.length).toLocaleString("en")}
          </span>
          {more ? (
            <Link href={link(month, page + 1)} scroll={false}>
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
