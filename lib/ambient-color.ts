function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / delta + 2) * 60;
  else hue = ((r - g) / delta + 4) * 60;
  return [hue, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = (hue % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;
  if (sector < 1) [red, green] = [chroma, second];
  else if (sector < 2) [red, green] = [second, chroma];
  else if (sector < 3) [green, blue] = [chroma, second];
  else if (sector < 4) [green, blue] = [second, chroma];
  else if (sector < 5) [red, blue] = [second, chroma];
  else [red, blue] = [chroma, second];
  const match = lightness - chroma / 2;
  return [
    Math.round(Math.min(1, Math.max(0, red + match)) * 255),
    Math.round(Math.min(1, Math.max(0, green + match)) * 255),
    Math.round(Math.min(1, Math.max(0, blue + match)) * 255),
  ];
}

function hexByte(value: number) {
  return value.toString(16).padStart(2, "0");
}

export function extractAmbientColor(pixels: ArrayLike<number>): string | null {
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < 128) continue;
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (max < 0.11 || min > 0.92 || delta < 0.08) continue;
    const [hue, sat, lightness] = rgbToHsl(r, g, b);
    if (sat < 0.14) continue;
    const weight = sat * (0.4 + 0.6 * (1 - Math.abs(2 * lightness - 1)));
    const bucket = buckets[Math.floor(hue / 30) % 12];
    bucket.weight += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
  }

  let best = buckets[0];
  for (const bucket of buckets) {
    if (bucket.weight > best.weight) best = bucket;
  }
  if (best.weight <= 0) return null;

  const [hue, sat, lightness] = rgbToHsl(best.r / best.weight, best.g / best.weight, best.b / best.weight);
  const balancedSat = Math.min(0.72, Math.max(0.38, sat));
  const balancedLight = Math.min(0.56, Math.max(0.42, lightness));
  const [red, green, blue] = hslToRgb(hue, balancedSat, balancedLight);
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}
