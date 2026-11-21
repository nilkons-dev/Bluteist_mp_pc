/**
 * Recognises a pasted YouTube link in the search box — watch pages, youtu.be, Shorts, embeds, YouTube Music and
 * playlist pages, with or without "https://" — and says which video or playlist it points at.
 */

export type YouTubeLink = { kind: "video"; videoId: string } | { kind: "playlist"; listId: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,80}$/;
const HOSTS = /^(?:www\.|m\.|music\.)?youtube(?:-nocookie)?\.com$/i;
const SHORT_HOST = /^(?:www\.)?youtu\.be$/i;

export function parseYouTubeLink(raw: string): YouTubeLink | null {
  const text = raw.trim();
  // One token, no spaces: a link, never a search phrase that merely mentions YouTube.
  if (!text || text.length > 600 || /\s/.test(text)) return null;
  if (!/^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$)/i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);
  const video = (id: string | undefined): YouTubeLink | null => (id && VIDEO_ID.test(id) ? { kind: "video", videoId: id } : null);

  if (SHORT_HOST.test(host)) {
    return video(parts[0]) ?? null;
  }
  if (!HOSTS.test(host)) return null;
  const first = parts[0]?.toLowerCase();
  if (first === "watch" || parts.length === 0) {
    const v = video(url.searchParams.get("v") ?? undefined);
    if (v) return v;
  } else if (first === "shorts" || first === "embed" || first === "live" || first === "v") {
    const v = video(parts[1]);
    if (v) return v;
  }
  // A playlist page (or a watch page whose video id is missing): the list is what the link points at.
  const list = url.searchParams.get("list");
  if (list && LIST_ID.test(list) && (first === "playlist" || first === "watch")) return { kind: "playlist", listId: list };
  return null;
}
