export function routeParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
