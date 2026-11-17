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

Phone and browser notifications are turned on per device in Settings. They need Soundscape to be opened over https, for example through Tailscale Serve; on iPhone, add Soundscape to the Home Screen first. Push services may contact whoever runs the server, so you can set `PUSH_CONTACT=mailto:you@example.com` in `.env`.

Song previews come from Deezer, and from Apple Music for songs Deezer doesn't have. If you've connected Navidrome on the Connect page (use an address the Soundscape container can reach, such as `http://host.docker.internal:4533` when Navidrome runs on the same computer; Tailscale `.ts.net` names don't work from inside Docker) and it has the song, Preview plays the whole song from your own library instead. Soundscape streams it through the server, so your Navidrome login never reaches the browser, and it falls back to the 30-second preview if Navidrome can't play it. The lyrics button in the player shows the words, line by line in time when they're synced. They come from Navidrome when your files have them, otherwise from [LRCLIB](https://lrclib.net), which is sent the song's artist, title and album. 📻 Start radio on a song or artist page fills the queue from your Navidrome with that artist and the artists Soundscape listeners play alongside it, and keeps adding songs as you go. Full songs from Navidrome are levelled with the ReplayGain tags Navidrome reads from your files, by album while a whole album plays and by song otherwise; turn it off under Player on the Settings page. The same place has an optional crossfade; songs from one album always follow each other without a gap. Apple's catalogue differs a little by country; set `APPLE_MUSIC_COUNTRY` in `.env` to a two-letter store code such as `de` (the default is `us`).

Every Soundscape player you're logged in to, in a browser tab, the desktop app or the Android app, shows up under **Devices** in the player (the screen-and-phone button). From there you can see what each one is playing, pause it, skip, seek and change its volume, take its music over with **Play here**, or hand yours to it with **Play my music there**. When something plays on another device and nothing plays on this one, a small "Playing on…" button at the bottom opens the same list. It works through your Soundscape server, so the devices don't need to be on the same network. A browser tab that hasn't been clicked yet may not be allowed to start sound by itself; Devices says so, and pressing play on it once fixes that.

`/health` answers 200 when PostgreSQL is reachable and 503 when it is not, for uptime monitors such as Uptime Kuma. Docker uses it too: `docker ps` shows the app as `healthy` or `unhealthy`.

To import from Last.fm, create a free API key at [last.fm/api/account/create](https://www.last.fm/api/account/create) and add `LASTFM_API_KEY=your-key` to `.env`.

Every few hours Soundscape asks MusicBrainz about new albums and EPs from each listener's 30 most played artists (each artist at most once a week). New ones from the last month show up under Recommendations and as a notification.

To also scrobble to Last.fm, add the shared secret from the same page as `LASTFM_SHARED_SECRET=your-secret`. Each person then clicks Connect Last.fm on the Connect page. Soundscape passes on what they're playing right now and every play that reaches it live (from Navidrome, the desktop app, phone apps and the play button), retries every few minutes while Last.fm is down, and drops plays once they're older than the two weeks Last.fm accepts. Imported history is never sent. If a player already scrobbles to Last.fm itself, turn that off to avoid doubles.

## Useful commands

| Command | What it does |
|---|---|
| `npm test` / `npm run test:api` | Unit / API tests |
| `npm run test:e2e` | Browser smoke test against a running server (`BASE_URL`, needs `npx playwright install chromium` once) |
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
