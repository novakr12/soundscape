<p align="center">
  <img src="app/icon.svg" width="96" alt="Soundscape logo">
</p>

<h1 align="center">Soundscape</h1>

A self-hosted music tracker and player for Navidrome, Jellyfin, and any ListenBrainz-compatible player. Built with Next.js and PostgreSQL.

Companion apps: [Linux Desktop](https://github.com/novakr12/soundscape-desktop) · [Android](https://github.com/novakr12/soundscape-android)

## Features

- **Tracking & stats**: live plays, charts, leaderboards, friends, new-release radar, yearly recaps, and Last.fm import/scrobbling.
- **Player**: Navidrome full-song streaming (with Deezer/Apple Music previews as fallback), ReplayGain, crossfade, 10-band equalizer, visualizer, and sleep timer.
- **Now Playing & lyrics**: full-screen theater view with ambient cover tint and synced lyrics (Navidrome or [LRCLIB](https://lrclib.net)).
- **Queue & radio**: drag-and-drop queue reordering, save queue as a Navidrome playlist, and song/artist radio.
- **Devices & listening parties**: remote playback and queue handoff across browsers, Linux Desktop, and Android, plus synced listening parties.
- **Notifications**: browser and mobile push notifications for followers, releases, milestones, and weekly recaps (requires HTTPS).

## Run it

Development:

```bash
docker compose up
```

Production (listens on `127.0.0.1:3000`):

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
docker compose -f docker-compose.yml -f compose.prod.yml up -d --build
```

Open the app, sign up, and follow **Connect** to link your player or Navidrome (use a Docker-reachable URL such as `http://host.docker.internal:4533`). Local production overrides belong in `compose.local.yml`, which `scripts/update.sh` applies if present. `/health` returns `200` when PostgreSQL is reachable and `503` otherwise.

## Configuration (`.env`)

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Session signing secret (required in production) |
| `SIGNUPS` | Account registration: `open` (default), `invite`, or `closed` |
| `ADMIN_USERS` | Comma-separated admin usernames (enables Admin page and artist/song merge & rename) |
| `LASTFM_API_KEY` | Last.fm API key for history import and scrobbling |
| `LASTFM_SHARED_SECRET` | Last.fm shared secret for live scrobbling |
| `PUSH_CONTACT` | `mailto:` contact address for web push services |
| `APPLE_MUSIC_COUNTRY` | Two-letter Apple Music store code for previews (default `us`) |

## Commands

| Command                                                                          | Description                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `npm test` / `npm run test:api` / `npm run test:e2e`                             | Unit / API / Playwright smoke tests (`BASE_URL`)       |
| `npm run lint` / `npm run format` / `npm run typecheck`                          | Biome lint/format and TypeScript check                 |
| `npm run db:covers` / `db:albums` / `db:genres` / `db:photos` / `db:artist-info` | Backfill covers, albums, genres, photos, and bios      |
| `npm run db:dedupe`                                                              | Find or remove duplicate pl--ays (`--apply` to delete) |
| `scripts/update.sh`                                                              | Pull, rebuild, and restart production                  |
| `scripts/backup.sh` / `scripts/restore.sh <file>`                                | Back up or restore data                                |

In production, run `npm` commands inside the `tools` container:

```bash
docker compose -f docker-compose.yml -f compose.prod.yml run --rm --build tools <command>
```

## License

[AGPL-3.0-or-later](LICENSE). Copies and modified versions must preserve the "Soundscape by novakr12" credit; see [NOTICE](NOTICE).
