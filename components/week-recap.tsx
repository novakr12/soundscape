import Cover from "@/components/cover";
import { ArtistLink, SongLink } from "@/components/music-links";
import { formatListeningTime } from "@/lib/time";
import type { WeekRecap } from "@/lib/week-recap";

function plural(count: number, word: string) {
  return `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;
}

function ordinal(rank: number) {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10];
  return `${rank}${suffix ?? "th"}`;
}

function range(from: string, to: string) {
  const format = (day: string, withMonth: boolean) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      ...(withMonth ? { month: "long" } : {}),
      timeZone: "UTC",
    });
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${format(from, !sameMonth)} – ${format(to, true)}`;
}

function change(plays: number, before: number) {
  if (before === 0) return "nothing the week before";
  const percent = Math.round(((plays - before) / before) * 100);
  if (percent === 0) return "same as the week before";
  return `${percent > 0 ? "↑" : "↓"} ${Math.abs(percent)}% on the week before`;
}

export default function WeekRecapView({ recap }: { recap: WeekRecap }) {
  const tiles = [
    { label: "Plays", value: recap.plays.toLocaleString("en"), note: change(recap.plays, recap.playsBefore) },
    { label: "Listening time", value: formatListeningTime(recap.listeningMs) },
    { label: "New artists", value: recap.newArtists.toLocaleString("en") },
    ...(recap.place && recap.place.of > 1
      ? [{ label: "Among friends", value: ordinal(recap.place.rank), note: `of ${recap.place.of}` }]
      : []),
  ];

  return (
    <section className="week-recap">
      <h2>Your week</h2>
      <p className="muted">{range(recap.from, recap.to)}</p>
      <div className="tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="tile">
            <span className="muted">{tile.label}</span>
            <strong>{tile.value}</strong>
            {tile.note && <small className="muted">{tile.note}</small>}
          </div>
        ))}
      </div>
      <ul className="listening-list">
        {recap.topSong && (
          <li>
            <Cover src={recap.topSong.cover} />
            <span className="listening-info">
              <span>
                <SongLink trackId={recap.topSong.trackId}>{recap.topSong.title}</SongLink>{" "}
                <span className="muted">
                  · <ArtistLink name={recap.topSong.artist} />
                </span>
              </span>
              <small className="muted">Top song · {plural(recap.topSong.plays, "play")}</small>
            </span>
          </li>
        )}
        {recap.topArtist && (
          <li>
            <Cover src={recap.topArtist.photo} round={Boolean(recap.topArtist.photo)} />
            <span className="listening-info">
              <ArtistLink name={recap.topArtist.name} />
              <small className="muted">Top artist · {plural(recap.topArtist.plays, "play")}</small>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
