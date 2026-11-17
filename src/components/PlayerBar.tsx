/**
 * PlayerBar — (the centre is now the eye transport, EyeTransport.tsx; the rest is) a point-for-point clone of the Spotify web player's
 * now-playing bar. All values below were extracted from Spotify's live
 * computed styles (DevTools), and every icon is Spotify's own SVG
 * geometry extracted verbatim from the page (SpotifyIcons.tsx):
 *
 *  - black 88px bar (measured off the desktop app), 56px content row
 *    centred → 16px inset top/bottom; 16px to the cover on the left, 8px
 *    footer padding + 8px button padding = 16px to the last glyph on the right
 *  - left: 56px cover (4px radius, #282828 placeholder), 10px gap,
 *    title 14/19 white + artists 12/17 #b3b3b3, both with Spotify's
 *    6px underline-padding trick and hover underline; like button 16×32
 *    with a 16px icon (#b3b3b3 → white), 16px after the text
 *  - centre: [shuffle, prev] —16px— play disc —16px— [next, repeat], the
 *    groups flex-1 so the disc sits dead centre; buttons 32×32 (8px pad,
 *    full radius), icons 16×16 #b3b3b3 → white on hover; disc 32px white
 *    with the black 16px glyph; active modes keep their colour with a
 *    white dot beneath (Spotify's treatment)
 *  - seek row (8px below transport): fixed 50px time boxes (12/17
 *    #b3b3b3) flanking a flexible bar — 12px hit area, 4px track (2px
 *    radius, white @30%), white fill, 12px white handle on hover
 *  - right: the eye extras (EyeExtras.tsx): sleep / lyrics / queue / room / volume / miniplayer / fullscreen
 */
import { useRef } from "react";
import { Heart, ListMusic, ListPlus } from "lucide-react";
import { SpCheck, SpCoverNote, SpPlus } from "./SpotifyIcons";
import { EyeExtras } from "./EyeExtras";
import { EyeTransport } from "./EyeTransport";
import { useLibrary } from "../stores/library";
import { usePlayer, shownTrack } from "../stores/player";
import { useUI, type MenuItem } from "../stores/ui";
import { upgradeArtwork } from "../lib/artwork";
import { useDrag } from "../lib/dnd";
import { shortTitle } from "../lib/format";
import { addSongsToPlaylists, newPlaylistWith } from "../lib/devicePlaylists";
import { FitText } from "./FitText";

export function PlayerBar() {
  const track = usePlayer(shownTrack);

  const liked = useLibrary((s) => (track ? s.liked.some((t) => t.id === track.id) : false));
  const coverDrag = useDrag({ track: track ?? { id: "", title: "", artist: "", duration: 0, thumb: "" } });

  /** The "+" beside the track — two top-level options: liked, and the
      playlists flyout (hover → every playlist + "New playlist"), so a big
      playlist library never floods the first click. */
  const addToPlaylistRef = useRef<HTMLButtonElement | null>(null);
  const openAddToPlaylist = (): void => {
    if (!track) return;
    // Real toggle: when the picker is already open, this click closes it.
    // (The pointerdown handler on the button below keeps the open menu alive
    // until the click arrives — otherwise the menu's outside-press dismissal
    // fired first and every press on "+" re-opened it, never closing it.)
    if (useUI.getState().contextMenu) {
      useUI.getState().closeContextMenu();
      return;
    }
    const lib = useLibrary.getState();
    const items: MenuItem[] = [
      {
        label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
        icon: Heart,
        action: () => lib.toggleLike(track),
      },
      {
        label: "Add to playlist",
        icon: ListMusic,
        children: [
          // Each playlist on or off: checked when it holds the song, and choosing it adds or removes.
          ...lib.playlists.map((p): MenuItem => {
            const inList = p.tracks.some((t) => t.id === track.id);
            return {
              label: p.name,
              checked: inList,
              toggle: true,
              action: () => {
                if (inList) {
                  useLibrary.getState().removeFromPlaylist(p.id, track.id);
                  useUI.getState().toast(`Removed from "${p.name}"`);
                } else {
                  const { added, told } = addSongsToPlaylists([p.id], [track]);
                  if (!told) useUI.getState().toast(added ? `Added to "${p.name}"` : "Already in this playlist");
                }
              },
            };
          }),
          {
            separatorBefore: lib.playlists.length > 0,
            label: "New playlist",
            icon: ListPlus,
            action: () => {
              // Name it before it exists — cancel adds nothing. Blank
              // confirm keeps the numbered default.
              const suggested = `Playlist ${useLibrary.getState().playlists.length + 1}`;
              useUI.getState().openDialog({
                title: "New playlist",
                body: `Add "${shortTitle(track.title)}" to a new playlist.`,
                initialValue: suggested,
                placeholder: "Playlist name",
                confirmLabel: "Create",
                onConfirm: (value) => {
                  const playlist = newPlaylistWith(value.trim() || suggested, [track]);
                  useUI.getState().navigate({ name: "playlist", param: playlist.id });
                },
              });
            },
          },
        ],
      },
      { subject: { title: track.title, subtitle: track.artist, thumb: track.thumb } },
    ];
    const rect = addToPlaylistRef.current?.getBoundingClientRect();
    // The playbar hugs the window bottom — the menu hangs ABOVE the button.
    useUI
      .getState()
      .openContextMenu(rect?.left ?? window.innerWidth / 2, rect?.top ?? window.innerHeight / 2, items, {
        above: true,
      });
  };

  const toggleNowPlaying = useUI((s) => s.toggleNowPlaying);

  return (
    <footer className="shrink-0 z-30 bg-black px-2">
      <div
        className="h-[96px] grid grid-cols-[3fr_4fr_3fr] items-center"
        role="contentinfo"
        aria-label="Now playing bar"
      >
        {/* Track info — click opens the Now Playing view. */}
        <div className="flex items-center min-w-0 pl-2">
          <button
            onClick={toggleNowPlaying}
            {...(track ? coverDrag.props : {})}
            title="Now playing view — drag to a playlist to add this song"
            aria-label="Now playing view"
            className={`h-14 w-14 shrink-0 overflow-hidden rounded-[4px] bg-[#282828] focus:outline-none ${
              track && coverDrag.dragging ? "opacity-50" : ""
            }`}
          >
            {track?.thumb ? (
              <img
                key={track.id}
                src={upgradeArtwork(track.thumb)}
                alt=""
                className="h-full w-full object-cover animate-art-in"
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <SpCoverNote />
              </div>
            )}
          </button>
          <div className="ml-2.5 min-w-0">
            <button onClick={toggleNowPlaying} className="block w-full text-left animate-meta-in" key={track ? `meta-${track.id}` : "meta-none"}>
              <span className="block min-w-0 px-1.5 -mx-1.5 text-[14px] leading-[19px] text-white hover:underline">
                <FitText mode="auto" text={track ? shortTitle(track.title) : "Nothing playing"} full={track?.title} />
              </span>
              <span className="block min-w-0 px-1.5 -mx-1.5 text-[12px] leading-[17px] text-[#b3b3b3] hover:underline">
                <FitText mode="auto" text={track ? track.artist : "Search for something to play"} />
              </span>
            </button>
          </div>
          {track && (
            <button
              ref={addToPlaylistRef}
              onPointerDown={(e) => {
                // Keep the context menu's outside-press dismissal from
                // closing an open picker on this press — the click handler
                // then sees the open menu and toggles it closed instead.
                e.stopPropagation();
              }}
              onClick={(e) => {
                // The opening click must not bubble to the ContextMenu's
                // click-outside listener, or it closes itself immediately.
                e.stopPropagation();
                openAddToPlaylist();
              }}
              title="Add to playlist"
              aria-label="Add to playlist"
              aria-haspopup="menu"
              className="ml-4 flex h-8 w-4 shrink-0 items-center justify-center text-[#b3b3b3] transition-all hover:scale-105 hover:text-white active:scale-95"
            >
              {/* Spotify's model: the glyph reflects Liked state, the click
                  always opens the add-to-playlist picker. */}
              {liked ? <SpCheck /> : <SpPlus />}
            </button>
          )}
        </div>

        {/* Centre — the eye transport: shuffle, previous, the eye play button, next, repeat, and the seek bar. */}
        <div className="flex min-w-0 flex-col justify-center">
          <EyeTransport />
        </div>

        {/* Right — sleep, lyrics, queue, room, volume, miniplayer, fullscreen (the eye extras). */}
        <div className="flex items-center justify-end min-w-0">
          <EyeExtras />
        </div>
      </div>
    </footer>
  );
}
