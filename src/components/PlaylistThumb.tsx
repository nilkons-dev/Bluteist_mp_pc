/**
 * A playlist's picture, as Spotify draws it: the one the listener chose when there is one; otherwise the songs' own
 * covers — one song, its cover; two, side by side; three, one tall beside two; four or more, a 2×2 of the first four —
 * and a quiet note tile while the playlist is empty. Distinct covers only, so a record's songs do not repeat.
 */
import { SpCoverNote } from "./SpotifyIcons";
import { upgradeArtwork } from "../lib/artwork";
import { playlistCovers } from "../lib/playlistCovers";

export { playlistCovers };

export function PlaylistThumb({ covers, size = 40, round = 6 }: { covers: string[]; size?: number; round?: number }) {
  const n = covers.length >= 4 ? 4 : covers.length;
  const img = (src: string, style?: React.CSSProperties) => (
    <img src={upgradeArtwork(src)} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }} />
  );
  let body: React.ReactNode;
  if (n === 0) {
    body = (
      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.55)" }}>
        <SpCoverNote className="w-5 h-5" />
      </div>
    );
  } else if (n === 1) {
    body = img(covers[0]);
  } else if (n === 2) {
    body = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, width: "100%", height: "100%" }}>
        {covers.slice(0, 2).map((c) => <div key={c} style={{ overflow: "hidden" }}>{img(c)}</div>)}
      </div>
    );
  } else if (n === 3) {
    body = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1, width: "100%", height: "100%" }}>
        <div style={{ gridRow: "1 / 3", overflow: "hidden" }}>{img(covers[0])}</div>
        <div style={{ overflow: "hidden" }}>{img(covers[1])}</div>
        <div style={{ overflow: "hidden" }}>{img(covers[2])}</div>
      </div>
    );
  } else {
    body = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1, width: "100%", height: "100%" }}>
        {covers.slice(0, 4).map((c) => <div key={c} style={{ overflow: "hidden" }}>{img(c)}</div>)}
      </div>
    );
  }
  return (
    <span aria-hidden className="art-hairline" style={{ display: "block", width: size, height: size, borderRadius: round, overflow: "hidden", flex: "none", background: "#111" }}>
      {body}
    </span>
  );
}
