export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrate } = await import("./lib/migrations");
  const { sql } = await import("./lib/postgres");
  const applied = await migrate(sql);
  if (applied.length > 0) console.log(`PostgreSQL: applied ${applied.join(", ")}`);
  const { startCleanup } = await import("./lib/kv");
  startCleanup();
  const { startJellyfinPolling } = await import("./lib/jellyfin");
  startJellyfinPolling();
  const { startGenreFilling } = await import("./lib/genres");
  startGenreFilling();
  const { startArtistPhotoFilling } = await import("./lib/artist-photos");
  startArtistPhotoFilling();
}
