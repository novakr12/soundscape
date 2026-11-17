export const dynamic = "force-static";

const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline · Soundscape</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#111;color:#eee;text-align:center;padding:1rem}button{margin-top:1rem;padding:.5rem 1rem;border-radius:6px;border:1px solid #444;background:#1db954;color:#111;font-weight:600}</style></head><body><main><h1>You're offline</h1><p>Soundscape can't reach your server right now.</p><button onclick="location.reload()">Try again</button></main></body></html>`;

const WORKER = `
const OFFLINE = ${JSON.stringify(OFFLINE)};

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Soundscape", {
      body: message.body || "",
      icon: "/apple-icon",
      tag: message.tag,
      data: { url: message.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.location.origin));
      if (open) return open.navigate(url).then((client) => (client || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
`;

export function GET() {
  return new Response(WORKER, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
