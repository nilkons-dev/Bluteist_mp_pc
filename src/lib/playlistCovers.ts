/** Which covers stand for a playlist: its own picture, the artist's photo, or up to four distinct song covers. */
export function playlistCovers(p: { cover?: string; artistThumb?: string; tracks: ReadonlyArray<{ thumb?: string | null }> }): string[] {
  if (p.cover) return [p.cover];
  if (p.artistThumb) return [p.artistThumb];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of p.tracks) {
    if (t.thumb && !seen.has(t.thumb)) {
      seen.add(t.thumb);
      out.push(t.thumb);
      if (out.length === 4) break;
    }
  }
  return out;
}
