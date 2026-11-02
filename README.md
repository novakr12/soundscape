<p align="center">
  <img src="app/icon.svg" width="96" alt="Soundscape logo">
</p>

<h1 align="center">Soundscape</h1>

A self-hosted music tracker. It records what you play from Navidrome, Jellyfin or any ListenBrainz-compatible player, shows live charts, stats and a yearly recap, and recommends music from listeners with similar taste.

Built with Next.js and PostgreSQL.

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

Then open the app, sign up, and follow the **Connect** page to point your player at Soundscape.

To choose who can create accounts, set `SIGNUPS` in `.env`: `open` (anyone, the default), `invite` (only with an invite link, which any member can create in Settings) or `closed`.

To see the admin page (accounts, library status, backups and maintenance buttons), add your username to `ADMIN_USERS` in `.env`, for example `ADMIN_USERS=admin`. Admins can also rename and merge artists and songs from their pages; plays sent later under the old name follow automatically.

Soundscape used to keep its data in Cassandra, Neo4j and Redis because it started as a university project. This is not the case anymore, now it uses PostgreSQL.

`/health` answers 200 when PostgreSQL is reachable and 503 when it is not, for uptime monitors such as Uptime Kuma. Docker uses it too: `docker ps` shows the app as `healthy` or `unhealthy`.

To import from Last.fm, create a free API key at [last.fm/api/account/create](https://www.last.fm/api/account/create) and add `LASTFM_API_KEY=your-key` to `.env`.

## Useful commands

| Command | What it does |
|---|---|
| `npm test` / `npm run test:api` | Unit / API tests |
| `npm run lint` / `npm run format` | Check / fix formatting and lint rules with Biome |
| `npm run db:covers` | Fill in missing album covers |
| `npm run db:albums` | Fill in albums from ListenBrainz and Deezer |
| `npm run db:genres` | Fill in artist genres from MusicBrainz (new artists also get theirs every hour) |
| `npm run db:photos` | Fill in artist photos from Deezer (new artists also get theirs every hour) |
| `npm run db:artist-info` | Fill in artist bios and links from MusicBrainz and Wikipedia (also every hour) |
| `npm run db:dedupe` | Remove plays counted twice, e.g. from both ListenBrainz and Last.fm (`-- --apply` to remove) |
| `scripts/update.sh` | Update production: pull, rebuild, restart and wait until it answers |
| `scripts/backup.sh` / `scripts/restore.sh <file>` | Back up / restore all data |

In production, run `npm` commands in the tools container, for example `docker compose -f docker-compose.yml -f compose.prod.yml run --rm --build tools npm run db:photos`. The app image itself only contains what it needs to run.

## License

[AGPL-3.0-or-later](LICENSE). Copies and modified versions must keep the "Soundscape by novakr12" credit, see [NOTICE](NOTICE).
