export function redirectTo(path: string, headers: Record<string, string> = {}) {
  return new Response(null, { status: 307, headers: { ...headers, location: path } });
}
