export function niceTicks(max: number, count = 4, integers = true): number[] {
  if (!(max > 0)) return integers ? [0, 1] : [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 && !integers ? 2.5 : residual <= 5 ? 5 : 10;
  const step = integers ? Math.max(1, Math.ceil(factor * magnitude)) : factor * magnitude;
  const steps = Math.ceil(max / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, index) => Math.round(index * step * 1e9) / 1e9);
}

export function shownLabels(count: number, most = 7): boolean[] {
  if (count <= most) return Array.from({ length: count }, () => true);
  const step = Math.ceil(count / most);
  const shown = Array.from({ length: count }, (_, index) => index % step === 0);
  const lastShown = Math.floor((count - 1) / step) * step;
  if (count - 1 - lastShown >= step * 0.6) shown[count - 1] = true;
  return shown;
}

export function share(value: number, top: number) {
  if (!(top > 0)) return 0;
  return Math.min(100, Math.max(0, (value / top) * 100));
}
