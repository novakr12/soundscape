export const USER_AGENT = "Soundscape/0.1 ( https://github.com/novakr12/soundscape )";

type Options = RequestInit & { timeoutMs?: number };

export function request(url: string | URL, { timeoutMs = 10_000, headers, signal, ...init }: Options = {}) {
  const sent = new Headers(headers);
  if (!sent.has("user-agent")) sent.set("user-agent", USER_AGENT);
  return fetch(url, { cache: "no-store", ...init, headers: sent, signal: signal ?? AbortSignal.timeout(timeoutMs) });
}
