export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { migrate } = await import("./lib/migrations");
  const { sql } = await import("./lib/postgres");
  const applied = await migrate(sql);
  if (applied.length > 0) console.log(`PostgreSQL: applied ${applied.join(", ")}`);
  const { removeExpired } = await import("./lib/kv");
  const { every } = await import("./lib/jobs");
  const { removeOldErrors } = await import("./lib/errors");
  every("cleanup", 10 * 60 * 1000, async () => {
    await removeExpired();
    await removeOldErrors();
    return undefined;
  });
  const { startJellyfinPolling } = await import("./lib/jellyfin");
  startJellyfinPolling();
  const { startGenreFilling } = await import("./lib/genres");
  startGenreFilling();
  const { startArtistPhotoFilling } = await import("./lib/artist-photos");
  startArtistPhotoFilling();
  const { startArtistInfoFilling } = await import("./lib/artist-info");
  startArtistInfoFilling();
  const { startNotificationChecks } = await import("./lib/notifications");
  startNotificationChecks();
}

export async function onRequestError(error: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError, requestSource } = await import("./lib/errors");
  await recordError(requestSource(request.method, request.path), error);
}
