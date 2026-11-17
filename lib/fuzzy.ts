const SEPARATOR = /[\s\-–—·/&,.()]/;

export function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function fuzzyScore(query: string, text: string): number | null {
  const wanted = fold(query).replace(/\s+/g, "");
  const target = fold(text);
  if (!wanted) return 0;
  let score = 0;
  let from = 0;
  let streak = 0;
  let first = -1;
  for (const char of wanted) {
    const found = target.indexOf(char, from);
    if (found < 0) return null;
    if (first < 0) first = found;
    streak = found === from && from > 0 ? streak + 1 : 0;
    const startsWord = found === 0 || SEPARATOR.test(target[found - 1]);
    score += 1 + streak * 2 + (startsWord ? 3 : 0);
    from = found + 1;
  }
  return score - first * 0.25 - (target.length - wanted.length) * 0.02;
}

export function fuzzySort<T>(query: string, items: T[], text: (item: T) => string) {
  return items
    .flatMap((item) => {
      const score = fuzzyScore(query, text(item));
      return score === null ? [] : [{ item, score }];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
