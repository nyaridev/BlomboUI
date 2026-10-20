/**
 * Small fuzzy matcher for the command palette: every query character must appear in order.
 * Matches at the start of the text or of a word, and consecutive runs, score higher, so
 * "gen" finds "Generate" before "Settings → Gallery". Returns null for no match.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  // A plain substring is the strongest signal.
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at * 2 - (t.length - q.length) * 0.1 + (at === 0 ? 200 : 0);
  let score = 0;
  let ti = 0;
  let run = 0;
  let gaps = 0;
  const chars = q.replace(/\s+/g, "").length;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    // Letters scattered across the whole text aren't a match ("dream" in "pruned …safetensors").
    if (ti > 0) gaps += found - ti;
    if (gaps > chars * 3) return null;
    const wordStart = found === 0 || /[\s/_\-.·→]/.test(t[found - 1] ?? "");
    run = found === ti ? run + 1 : 0;
    score += 10 + (wordStart ? 15 : 0) + run * 5 - Math.min(10, found - ti);
    ti = found + 1;
  }
  return score;
}

/** Items sorted by how well they match (best first); non-matches dropped. */
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query.trim()) return items;
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = fuzzyScore(query, text(item));
    if (score !== null) scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
