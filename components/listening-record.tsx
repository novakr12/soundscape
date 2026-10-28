import { ArtistLink, SongLink } from "@/components/music-links";
import type { ListeningRecord } from "@/lib/milestones";
import { localDay } from "@/lib/time";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function days(count: number) {
  return `${count.toLocaleString("en")} ${count === 1 ? "day" : "days"}`;
}

function ordinal(count: number) {
  if (count === 1) return "First play";
  return `${count.toLocaleString("en")}th play`;
}

export default function ListeningRecordView({ record }: { record: ListeningRecord }) {
  if (record.plays === 0) return null;
  const longest = record.longestStreak;

  return (
    <section>
      <h2>Streaks and milestones</h2>
      <div className="tiles">
        <div className="tile">
          <span className="muted">Current streak</span>
          <strong>{days(record.currentStreak)}</strong>
        </div>
        <div className="tile">
          <span className="muted">Longest streak</span>
          <strong>{days(longest?.days ?? 0)}</strong>
          {longest && longest.days > 1 && (
            <small className="muted">
              {dayLabel(longest.from)} to {dayLabel(longest.to)}
            </small>
          )}
        </div>
        <div className="tile">
          <span className="muted">Plays</span>
          <strong>{record.plays.toLocaleString("en")}</strong>
          {record.nextMilestone && (
            <small className="muted">
              {(record.nextMilestone - record.plays).toLocaleString("en")} to go until{" "}
              {record.nextMilestone.toLocaleString("en")}
            </small>
          )}
        </div>
      </div>
      <ol className="milestones">
        {[...record.milestones].reverse().map((milestone) => (
          <li key={milestone.count}>
            <strong>{ordinal(milestone.count)}</strong>{" "}
            <span className="muted">· {dayLabel(localDay(new Date(milestone.playedAt)))}</span>
            <br />
            <SongLink trackId={milestone.trackId}>{milestone.title}</SongLink>{" "}
            <span className="muted">
              · <ArtistLink name={milestone.artist} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
