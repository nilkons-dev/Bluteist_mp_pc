/**
 * Sidebar — the whole left panel is "Your Library", Spotify-style.
 *
 * One glass pill: a "Your Library" header (create button only) and a
 * scrollable list of the user's library — Liked Songs, Downloads,
 * playlists, folders, artists and Local Music. Main navigation lives in
 * the top bar (home beside the search field).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClipboardList, Folder, ImagePlus, Link2, ListPlus, Pin, PinOff, User } from "lucide-react";
import { isPinned, useLibrary, type PinnedSingleKey, type Playlist } from "../stores/library";
import { playingFromRow, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";
import { EqBars } from "./primitives";
import { FitText } from "./FitText";
import { shortTitle } from "../lib/format";
import { addSongsToPlaylists, staysOnDevice } from "../lib/devicePlaylists";
import { upgradeArtwork } from "../lib/artwork";
import { CreateMenu } from "./CreateMenu";
import { askForNewFolder, folderMenuItems, rowIsOpen } from "../lib/collection";
import { playlistOwnItems } from "../lib/trackActions";
import { draggingFromPlaylist, dragHasAlbum, dragHasArtist, dragHasPlaylist, dragHasTrack, readAlbum, readArtist, readPlaylist, readTrack, type AlbumPayload, type ArtistPayload, type PlaylistPayload } from "../lib/dnd";
import { requireBridge } from "../lib/bridge";
import { downloadAll, startDownload } from "../lib/downloads";
import { askToConnectSpotify, useSpotify } from "../lib/spotify";
import { askToImportPlaylist } from "../lib/importSongs";
import { mountBloom } from "../lib/bloom";
import { useEdgeFades } from "../lib/useEdgeFades";
import { arrange, moveKey } from "../lib/libraryOrder";
import { useSortable, type SortableRowProps } from "../lib/useSortable";
import { BookGlyph, LibIcon, PinGlyph, type LibIconKind } from "./LibraryIcons";
import { bookFx, flashRow, libFx, pinFx } from "./libraryFx";
import "./libraryEye.css";
import { PlaylistThumb, playlistCovers } from "./PlaylistThumb";
import { pickCoverImage } from "../lib/coverImage";
import type { Track } from "../types";

const SPOTIFY_ROW = "__spotify__";

/* ============================================================ nav */

interface LibRow {
  id: string;
  title: string;
  subtitle: string;
  thumb?: string;
  kind: "playlist" | "artist" | "folder" | "local" | "downloads" | "replay" | "spotify";
  /** artist-imported playlists open the artist page instead of the list */
  artistId?: string;
  /** playlists: the folder they're filed in; folders: their own id */
  folderId?: string;
  /** Liked / Downloads / Local shortcut rows carry their pin state */
  pinned?: boolean;
  /** a playlist's picture(s): its own image, or up to four song covers to combine */
  covers?: string[];
  /** which shortcut pin this row toggles (liked / downloads / local) */
  singleKey?: PinnedSingleKey;
}

/** One place in the list: a row, or a folder with its open playlists, moved together. */
interface Entry {
  /** "single:<key>", "artist:<id>", "playlist:<id>" or "folder:<id>" (lib/libraryOrder) */
  key: string;
  rows: LibRow[];
}

/** Flowers and a butterfly in the panel's bottom corner (src/lib/bloom.ts). They fade away while the panel is folded to its strip. */
function LibraryBloom({ host, compact }: { host: React.RefObject<HTMLDivElement | null>; compact: boolean }) {
  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const flyRef = useRef<HTMLCanvasElement | null>(null);
  const fx = useRef<ReturnType<typeof mountBloom> | null>(null);
  useEffect(() => {
    const side = host.current, bloom = bloomRef.current, fly = flyRef.current;
    if (!side || !bloom || !fly) return;
    const h = mountBloom({ side, bloom, fly });
    fx.current = h;
    return () => {
      h.dispose();
      fx.current = null;
    };
  }, [host]);
  useEffect(() => {
    const h = fx.current;
    if (!h) return;
    if (!compact) {
      h.setActive(true);
      return;
    }
    // let the fade finish before the loop is put to sleep
    const id = window.setTimeout(() => h.setActive(false), 480);
    return () => window.clearTimeout(id);
  }, [compact]);
  return (
    <>
      <canvas ref={bloomRef} className="lb-bloom" aria-hidden="true" />
      <canvas ref={flyRef} className="lb-fly" aria-hidden="true" />
    </>
  );
}

function LibraryPill({ compact }: { compact: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const folders = useLibrary((s) => s.folders);
  const followedArtists = useLibrary((s) => s.followedArtists);
  const downloads = useLibrary((s) => s.downloads);
  const pinnedSingles = useLibrary((s) => s.pinnedSingles);
  const spotifyConnected = useSpotify((s) => s.status.connected);
  const spotifyProblem = useSpotify((s) => s.status.problem);
  const spotifyPlaylists = useSpotify((s) => s.playlists);
  const navigate = useUI((s) => s.navigate);
  /** the page open in the middle panel: its row stays lit */
  const view = useUI((s) => s.view);
  const floating = useUI((s) => s.floating);
  const openDialog = useUI((s) => s.openDialog);
  const openContextMenu = useUI((s) => s.openContextMenu);
  const playingFrom = usePlayer(playingFromRow);

  const libraryOrder = useLibrary((s) => s.libraryOrder);
  /** the scrolling list, and the rows inside it that a drag reorders */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  useEdgeFades(scrollRef);
  /** the row a drag is currently hovering — drives the drop highlight */
  const [dropHover, setDropHover] = useState<string | null>(null);
  /** a playlist drag is over the library panel — import-anywhere affordance */
  const [libHover, setLibHover] = useState(false);
  /** the row a drop just landed on — drives the pulse */
  const [pulse, setPulse] = useState<string | null>(null);
  /**
   * The panel glow runs on a dragover-driven TTL: every dragover over the
   * panel (they fire continuously under the cursor) refreshes a 600ms
   * window; no events ⇒ it expires. Counters can drift — Chromium fires
   * dragleave without a matching dragenter — but dragover cannot lie.
   */
  const glowTimer = useRef<number | null>(null);
  const refreshGlow = (): void => {
    setLibHover(true);
    if (glowTimer.current !== null) window.clearTimeout(glowTimer.current);
    glowTimer.current = window.setTimeout(() => setLibHover(false), 600);
  };
  const clearGlow = (): void => {
    if (glowTimer.current !== null) {
      window.clearTimeout(glowTimer.current);
      glowTimer.current = null;
    }
    setLibHover(false);
  };

  // A drag that ends anywhere (dropped outside a target) clears hover state.
  useEffect(() => {
    const clear = (): void => {
      clearGlow();
      setDropHover(null);
    };
    window.addEventListener("dragend", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      clearGlow();
    };
  }, []);

  // Spotify's library contents: Liked Songs, Downloads, the user's playlists,
  // folders (collapsible), followed artists and Local Music. Recently-played
  // history is NOT library material — it lives in the queue panel's
  // "Recently played" tab.
  // Shortcut rows: Liked, Spotify and Replay are pinned by default, Downloads and
  // Local Music not; an unpinned one sits at the bottom of the list (re-pin from
  // its right-click menu).
  const doneDownloads = Object.values(downloads).filter((d) => d.status === "done");
  const singlePinned = (k: PinnedSingleKey): boolean => isPinned(pinnedSingles, k);

  const likedRow: LibRow = {
    id: "__liked__",
    title: "Liked Songs",
    subtitle: `Playlist · ${liked.length} ${liked.length === 1 ? "track" : "tracks"}`,
    // The four collections Blutheist keeps carry sleeves of their own, the same from the first day.
    kind: "playlist",
    pinned: singlePinned("liked"),
    singleKey: "liked",
  };
  const downloadsRow: LibRow = {
    id: "__downloads__",
    title: "Downloads",
    subtitle: `Playlist · ${doneDownloads.length} ${doneDownloads.length === 1 ? "track" : "tracks"}`,
    kind: "downloads",
    pinned: singlePinned("downloads"),
    singleKey: "downloads",
  };
  const localRow: LibRow = {
    id: "__local__",
    title: "Local Music",
    subtitle: "On this device",
    kind: "local",
    pinned: singlePinned("local"),
    singleKey: "local",
  };
  // Always listed: connected, it opens the account's playlists; not yet, it asks to connect.
  const spotifyLists = spotifyPlaylists.length;
  const spotifyRow: LibRow = {
    id: SPOTIFY_ROW,
    title: "Spotify",
    subtitle: !spotifyConnected
      ? "Connect your playlists"
      : spotifyProblem
        ? "Needs reconnecting"
        : spotifyLists // 0 until the first read: Liked Songs is always one
          ? `Connected · ${spotifyLists} ${spotifyLists === 1 ? "playlist" : "playlists"}`
          : "Connected",
    kind: "spotify",
    pinned: singlePinned("spotify"),
    singleKey: "spotify",
  };
  // Replay: listening stats, otherwise only reachable from Settings.
  const replayRow: LibRow = {
    id: "__replay__",
    title: "Replay",
    subtitle: "Your listening stats",
    kind: "replay",
    pinned: singlePinned("replay"),
    singleKey: "replay",
  };
  const singles: LibRow[] = [likedRow, spotifyRow, replayRow, downloadsRow, localRow];

  // A playlist of nothing but songs from this computer stays here, and says so where "Playlist" would be.
  const subtitleOf = (p: Playlist): string =>
    `${staysOnDevice(p) ? "On this device" : "Playlist"} · ${p.tracks.length} ${p.tracks.length === 1 ? "track" : "tracks"}`;
  const playlistRow = (p: Playlist): LibRow => ({
    id: p.id,
    title: p.name,
    subtitle: subtitleOf(p),
    thumb: p.artistThumb ?? p.tracks[0]?.thumb,
    covers: playlistCovers(p),
    kind: "playlist",
    artistId: p.artistId,
    ...(p.folderId ? { folderId: p.folderId } : {}),
  });
  const unfiled = playlists.filter((p) => !p.folderId);
  // Pinned rows stay on top where they are; every row below moves by drag, in the order last
  // dragged (lib/libraryOrder), a folder together with its open playlists.
  const fixed: Entry[] = [
    ...unfiled.filter((p) => p.pinned).map((p) => ({ key: `playlist:${p.id}`, rows: [playlistRow(p)] })),
  ];
  const movable: Entry[] = [
    ...followedArtists.map((a) => ({ key: `artist:${a.id}`, rows: [{ id: a.id, title: a.name, subtitle: "Artist", thumb: a.thumb, kind: "artist" as const }] })),
    ...unfiled.filter((p) => !p.pinned).map((p) => ({ key: `playlist:${p.id}`, rows: [playlistRow(p)] })),
    // A folder is one row: it opens its page in the middle panel (FolderView), where its playlists are.
    ...folders.map((f) => {
      const filed = playlists.filter((p) => p.folderId === f.id);
      return {
        key: `folder:${f.id}`,
        rows: [{ id: f.id, title: f.name, subtitle: `Folder · ${filed.length} ${filed.length === 1 ? "playlist" : "playlists"}`, kind: "folder" as const, folderId: f.id }],
      };
    }),
  ];
  const byKey = new Map(movable.map((e) => [e.key, e]));
  const entries: Entry[] = [...fixed, ...arrange(movable.map((e) => e.key), libraryOrder ?? []).map((k) => byKey.get(k)!)];
  const sortable = useSortable({
    signature: entries.map((e) => `${e.key}:${e.rows.length}`).join("|"),
    listRef: rowsRef,
    scrollRef,
    clamp: (_from, target) => Math.max(fixed.length, target),
    canDrag: (i) => i >= fixed.length,
    onCommit: (from, target) => {
      const keys = entries.slice(fixed.length).map((e) => e.key);
      useLibrary.getState().setLibraryOrder(moveKey(keys, from - fixed.length, target - fixed.length));
    },
  });

  /* ---------------------------------------------------------- drag & drop */

  /** Import a YouTube playlist as a real library playlist (same name). */
  const importPlaylist = async (pl: PlaylistPayload, folderId?: string): Promise<void> => {
    const ui = useUI.getState();
    ui.toast(`Importing “${pl.title}”…`);
    try {
      const page = await requireBridge().getPlaylist(pl.id);
      const name = (page.title || pl.title).trim() || "Imported playlist";
      const seen = new Set<string>();
      const tracks = (page.tracks ?? []).filter((t: Track) =>
        seen.has(t.id) ? false : (seen.add(t.id), true)
      );
      if (!tracks.length) throw new Error("no tracks");
      const n = tracks.length;
      const created = useLibrary.getState().importPlaylist(name, tracks, folderId);
      ui.toast(`“${created.name}” · ${n} ${n === 1 ? "song" : "songs"} added to your library`, "success");
    } catch {
      ui.toast(`Couldn't import “${pl.title}”`, "error");
    }
  };

  /** A dropped artist is FOLLOWED — the library shows their photo and the
      row opens their profile page (it never becomes a playlist). */
  const followDroppedArtist = (ar: ArtistPayload): void => {
    const added = useLibrary.getState().followArtist({ id: ar.id, name: ar.name, thumb: ar.thumb });
    const toast = useUI.getState().toast;
    if (added) toast(`Added “${ar.name}” to your library`, "success");
    else toast(`“${ar.name}” is already in your library`);
  };

  /** Import a YouTube album as a real library playlist (same name). */
  const importAlbum = async (al: AlbumPayload, folderId?: string): Promise<void> => {
    const ui = useUI.getState();
    ui.toast(`Importing “${shortTitle(al.title)}”…`);
    try {
      const page = await requireBridge().getAlbum(al.id);
      const name = (page.album?.title || al.title).trim() || "Imported album";
      const seen = new Set<string>();
      const tracks = (page.tracks ?? []).filter((t: Track) =>
        seen.has(t.id) ? false : (seen.add(t.id), true)
      );
      if (!tracks.length) throw new Error("no tracks");
      const n = tracks.length;
      const created = useLibrary.getState().importPlaylist(name, tracks, folderId);
      ui.toast(`“${created.name}” · ${n} ${n === 1 ? "song" : "songs"} added to your library`, "success");
    } catch {
      ui.toast(`Couldn't import “${shortTitle(al.title)}”`, "error");
    }
  };

  /** A dropped playlist payload that matches a local playlist is a FILING
      gesture (sidebar/library card → folder), not a YouTube import. */
  const localPlaylistName = (id: string): string | null =>
    useLibrary.getState().playlists.find((p) => p.id === id)?.name ?? null;

  const fileLocalPlaylist = (id: string, folderId: string): void => {
    const lib = useLibrary.getState();
    const toast = useUI.getState().toast;
    const name = localPlaylistName(id);
    if (!name) return;
    lib.setPlaylistFolder(id, folderId);
    toast(`Moved “${name}” into the folder`, "success");
    setPulse(folderId);
    window.setTimeout(() => setPulse((cur) => (cur === folderId ? null : cur)), 650);
  };

  /** A dropped track lands on Liked Songs or one of the user's playlists. */
  const dropTrackOn = (r: LibRow, track: Track): void => {
    const lib = useLibrary.getState();
    const toast = useUI.getState().toast;
    if (r.id === "__liked__") {
      if (lib.isLiked(track.id)) {
        toast(`“${shortTitle(track.title)}” is already in your Liked Songs`);
      } else {
        lib.toggleLike(track);
        toast(`Added “${shortTitle(track.title)}” to Liked Songs`, "success");
      }
    } else {
      const p = lib.playlists.find((pl) => pl.id === r.id);
      if (!p) return;
      const { added, told } = addSongsToPlaylists([r.id], [track]);
      if (!told) {
        toast(
          added
            ? `Added “${shortTitle(track.title)}” to “${p.name}”`
            : `“${shortTitle(track.title)}” is already in “${p.name}”`
        );
      }
    }
    setPulse(r.id);
    window.setTimeout(() => setPulse((cur) => (cur === r.id ? null : cur)), 650);
  };

  /** A dropped track on the Downloads row starts a download — same gesture
      as dropping on Liked Songs, but for offline saves. */
  const dropTrackOnDownloads = (track: Track): void => {
    void startDownload(track);
    setPulse("__downloads__");
    window.setTimeout(() => setPulse((cur) => (cur === "__downloads__" ? null : cur)), 650);
  };

  /** A dropped album on a playlist row appends the whole release. */
  const dropAlbumOn = async (r: LibRow, al: AlbumPayload): Promise<void> => {
    const lib = useLibrary.getState();
    const toast = useUI.getState().toast;
    try {
      const page = await requireBridge().getAlbum(al.id);
      const tracks = page.tracks ?? [];
      if (!tracks.length) throw new Error("no tracks");
      if (r.id === "__liked__") {
        let added = 0;
        for (const t of tracks) {
          if (!lib.isLiked(t.id)) {
            lib.toggleLike(t);
            added += 1;
          }
        }
        toast(
          added > 0
            ? `Added ${added} ${added === 1 ? "song" : "songs"} from “${al.title}” to Liked Songs`
            : `“${al.title}” is already in your Liked Songs`,
          added > 0 ? "success" : undefined
        );
      } else {
        const p = lib.playlists.find((pl) => pl.id === r.id);
        if (!p) return;
        let added = 0;
        for (const t of tracks) {
          if (lib.addToPlaylist(r.id, t)) added += 1;
        }
        toast(
          added > 0
            ? `Added ${added} ${added === 1 ? "song" : "songs"} from “${al.title}” to “${p.name}”`
            : `“${al.title}” is already in “${p.name}”`,
          added > 0 ? "success" : undefined
        );
      }
    } catch {
      toast(`Couldn't add “${shortTitle(al.title)}” here`, "error");
    }
    setPulse(r.id);
    window.setTimeout(() => setPulse((cur) => (cur === r.id ? null : cur)), 650);
  };

  /**
   * Hovering a folder with a song mid-drag opens the folder's page after a
   * beat, so the drag can go on to one of its playlists there: one gesture,
   * no re-drag. The highlight is immediate (onRowDragOver); only the opening
   * waits, the way file managers do.
   */
  const expandTimer = useRef<number | null>(null);
  const cancelPendingExpand = (): void => {
    if (expandTimer.current !== null) {
      window.clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
  };
  const openFolder = (folderId: string): void => navigate({ name: "folder", param: folderId });
  const scheduleExpand = (folderId: string): void => {
    const v = useUI.getState().view;
    if (v.name === "folder" && v.param === folderId) return;
    if (expandTimer.current !== null) return;
    expandTimer.current = window.setTimeout(() => {
      expandTimer.current = null;
      openFolder(folderId);
    }, 650);
  };
  useEffect(() => {
    const clear = (): void => {
      cancelPendingExpand();
      setDropHover(null);
    };
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  const onRowDragOver = (e: React.DragEvent, r: LibRow): void => {
    const isTrack = dragHasTrack(e);
    const isAlbum = dragHasAlbum(e);
    const isPlaylist = dragHasPlaylist(e);
    // Playlist rows (+ Downloads) take tracks and whole albums. __liked__
    // carries kind "playlist".
    // A song dragged from its own playlist's page isn't offered back to that playlist.
    const acceptsTracks =
      (r.kind === "playlist" || r.kind === "downloads") && (isTrack || isAlbum) && !draggingFromPlaylist(r.id);
    // Folders take playlists and albums (file/import into the folder). A
    // track hovering a folder previews the folder and opens it so the drag
    // can land on a playlist inside — the same gesture, no second attempt.
    const acceptsCollections = r.kind === "folder" && (isPlaylist || isAlbum);
    const previewsFolder = r.kind === "folder" && isTrack && !isPlaylist && !isAlbum;
    if (!acceptsTracks && !acceptsCollections && !previewsFolder) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDropHover(r.id);
    if (previewsFolder) scheduleExpand(r.id);
  };

  const onRowDragLeave = (e: React.DragEvent, r: LibRow): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropHover((cur) => (cur === r.id ? null : cur));
      cancelPendingExpand();
    }
  };

  const onRowDrop = (e: React.DragEvent, r: LibRow): void => {
    cancelPendingExpand();
    if ((r.kind === "playlist" || r.kind === "downloads") && (dragHasTrack(e) || dragHasAlbum(e))) {
      e.preventDefault();
      e.stopPropagation();
      setDropHover(null);
      if (dragHasAlbum(e)) {
        const al = readAlbum(e);
        if (!al) return;
        if (r.kind === "downloads") {
          // An album dropped on Downloads downloads every song on it.
          void requireBridge()
            .getAlbum(al.id)
            .then((page) => downloadAll(page.tracks ?? [], `"${page.album?.title || al.title}"`))
            .catch(() => useUI.getState().toast("Couldn't open that album to download it", "error"));
          return;
        }
        void dropAlbumOn(r, al);
        return;
      }
      const track = readTrack(e);
      if (!track) return;
      if (r.kind === "downloads") dropTrackOnDownloads(track);
      else dropTrackOn(r, track);
      return;
    }
    if (r.kind === "folder" && (dragHasPlaylist(e) || dragHasAlbum(e))) {
      e.preventDefault();
      e.stopPropagation();
      setDropHover(null);
      if (dragHasAlbum(e)) {
        const al = readAlbum(e);
        if (al) void importAlbum(al, r.id);
        return;
      }
      const pl = readPlaylist(e);
      if (!pl) return;
      // Local playlists are filed; YouTube playlists are imported.
      if (localPlaylistName(pl.id)) fileLocalPlaylist(pl.id, r.id);
      else void importPlaylist(pl, r.id);
      return;
    }
    if (r.kind === "folder" && dragHasTrack(e)) {
      // Folders hold playlists, not songs: open the folder's page so the next
      // drag can land on a playlist there, and say so once.
      e.preventDefault();
      e.stopPropagation();
      setDropHover(null);
      openFolder(r.id);
      setPulse(r.id);
      window.setTimeout(() => setPulse((cur) => (cur === r.id ? null : cur)), 650);
      useUI.getState().toast(`“${r.title}” holds playlists — drop onto one of them`, "info");
    }
  };

  /** the row that was tapped last: where the Spotify choices hang from */
  const spotifyAnchor = useRef<HTMLElement | null>(null);

  const onClickRow = (r: LibRow): void => {
    switch (r.kind) {
      case "artist":
        navigate({ name: "artist", param: r.id });
        break;
      case "playlist":
        if (r.id === "__liked__") navigate({ name: "library", param: "liked" });
        else if (r.artistId) navigate({ name: "artist", param: r.artistId });
        else navigate({ name: "playlist", param: r.id });
        break;
      case "downloads":
        navigate({ name: "downloads" });
        break;
      case "folder":
        openFolder(r.id);
        break;
      case "local":
        navigate({ name: "local" });
        break;
      case "replay":
        navigate({ name: "replay" });
        break;
      case "spotify":
        // Connected: the account's playlists open. Not yet: two ways in — import one playlist by its link, or connect the account.
        if (spotifyConnected) navigate({ name: "spotify" });
        else {
          const rc = spotifyAnchor.current?.getBoundingClientRect();
          useUI.getState().openContextMenu(
            rc ? rc.left + 14 : 120,
            rc ? rc.bottom + 4 : 180,
            [
              { label: "Import playlist", note: "Paste a playlist link", icon: ClipboardList, action: askToImportPlaylist },
              { label: "Connect Spotify", note: "Sign in to see all your playlists", icon: Link2, action: askToConnectSpotify },
            ],
            { owner: "lb-spotify" }
          );
        }
        break;
    }
  };

  /** Right-click a row: pin/unpin shortcuts, playlist options, folder options. */
  const onRowContextMenu = (e: React.MouseEvent, r: LibRow): void => {
    if (r.singleKey) {
      // the five shortcuts have nothing to pin: they always sit above the line
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (r.kind === "artist") {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, [
        {
          label: "Remove from your library",
          danger: true,
          action: () => {
            useLibrary.getState().unfollowArtist(r.id);
            useUI.getState().toast(`Removed “${r.title}” from your library`);
          },
        },
      ]);
      return;
    }
    if (r.kind === "playlist" && r.id !== "__liked__") {
      const playlist = playlists.find((p) => p.id === r.id);
      if (!playlist) return;
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, [
        {
          label: playlist.pinned ? "Unpin playlist" : "Pin playlist",
          // slashed pin = "currently pinned, click to undo" (Spotify's model)
          icon: playlist.pinned ? PinOff : Pin,
          action: () => useLibrary.getState().togglePinPlaylist(playlist.id),
        },
        {
          label: playlist.cover ? "Change picture…" : "Choose a picture…",
          icon: ImagePlus,
          action: () => {
            void pickCoverImage().then((url) => {
              if (url) useLibrary.getState().setPlaylistCover(playlist.id, url);
            });
          },
        },
        ...(playlist.cover
          ? [{ label: "Remove picture", action: () => useLibrary.getState().setPlaylistCover(playlist.id, null) }]
          : []),
        ...playlistOwnItems(playlist),
      ]);
      return;
    }
    if (r.kind === "folder") {
      const folder = folders.find((f) => f.id === r.id);
      if (!folder) return;
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(e.clientX, e.clientY, folderMenuItems(folder));
    }
  };

  /** Right-click the library panel itself — Spotify's create menu. Rows stop
      propagation so they keep their own menus; everywhere else (header, empty
      space) offers playlist/folder creation, each asking for a name first so
      nothing empty lands in the library. */
  const onLibraryContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: "Create playlist",
        icon: ListPlus,
        action: () => {
          const suggested = `My Playlist #${useLibrary.getState().playlists.length + 1}`;
          openDialog({
            title: "New playlist",
            body: "Give your playlist a name.",
            initialValue: suggested,
            placeholder: "Playlist name",
            confirmLabel: "Create",
            onConfirm: (value) => {
              const p = useLibrary.getState().createPlaylist(value.trim() || suggested);
              navigate({ name: "playlist", param: p.id });
            },
          });
        },
      },
      {
        label: "Create folder",
        icon: Folder,
        action: askForNewFolder,
      },
    ]);
  };

  const iconKindOf = (r: LibRow): LibIconKind =>
    r.kind === "spotify" ? "spotify"
    : r.kind === "replay" ? "replay"
    : r.kind === "local" ? "local"
    : r.kind === "downloads" ? "downloads"
    : r.kind === "folder" ? "folder"
    : r.id === "__liked__" ? "liked"
    : "playlist";

  /** one tap: the row flashes, its icon plays its motion, then the page opens */
  const tapRow = (e: React.MouseEvent<HTMLElement>, r: LibRow): void => {
    spotifyAnchor.current = e.currentTarget;
    flashRow(e.currentTarget);
    const ib = e.currentTarget.querySelector(".lb-ib");
    if (ib && r.kind !== "artist") libFx[iconKindOf(r)](ib);
    onClickRow(r);
  };

  function renderRow(r: LibRow, drag: SortableRowProps | undefined): ReactNode {
    const filed = r.kind === "folder" ? playlists.filter((p) => p.folderId === r.id) : [];
    // A folder plays when one of its playlists (or the folder itself) does.
    const isCurrent =
      playingFrom !== null && (playingFrom === r.id || playingFrom === r.artistId || filed.some((p) => p.id === playingFrom));
    const open = rowIsOpen(r, view);
    const pl = r.kind === "playlist" && !r.singleKey ? playlists.find((p) => p.id === r.id) : undefined;
    const canPin = !!pl && r.id !== "__liked__";
    const pinned = !!pl?.pinned;
    const togglePin = (): void => {
      if (pl) useLibrary.getState().togglePinPlaylist(pl.id);
    };
    return (
      <div
        key={`${r.kind}-${r.id}`}
        {...drag}
        role="button"
        tabIndex={0}
        aria-current={open ? "page" : undefined}
        title={compact ? r.title : undefined}
        onClick={(e) => tapRow(e, r)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            e.preventDefault();
            spotifyAnchor.current = e.currentTarget;
            onClickRow(r);
          } else drag?.onKeyDown(e);
        }}
        onContextMenu={(e) => onRowContextMenu(e, r)}
        onDragOver={(e) => onRowDragOver(e, r)}
        onDragLeave={(e) => onRowDragLeave(e, r)}
        onDrop={(e) => onRowDrop(e, r)}
        className={`lb-row fit-host group select-none ${open ? "sel" : ""} ${
          dropHover === r.id ? "ring-2 ring-inset ring-accent/60 bg-ink-hi/[0.08]" : ""
        } ${pulse === r.id ? "animate-drop-pulse" : ""}`}
      >
        {r.kind === "artist" ? (
          r.thumb ? (
            <span className="lb-ib"><img src={upgradeArtwork(r.thumb)} alt="" draggable={false} className="lb-photo art-hairline" /></span>
          ) : (
            <span className="lb-ib"><span className="lb-photo bg-ink-hi/[0.06] art-hairline grid place-items-center"><User className="w-5 h-5 text-ink-hi/55" /></span></span>
          )
        ) : r.kind === "playlist" && r.id !== "__liked__" ? (
          <span className="lb-ib lb-cover"><PlaylistThumb covers={r.covers ?? []} size={56} round={8} /></span>
        ) : (
          <span className="lb-ib"><LibIcon kind={iconKindOf(r)} on={open} /></span>
        )}
        <div className="lb-tx">
          <FitText text={r.title} className="text-[14px] font-semibold text-ink-hi" />
          <FitText text={r.subtitle} className="text-[12px] text-[#8c8c8c] mt-[3px]" />
        </div>
        {isCurrent && <EqBars />}
        {canPin && (
          <button
            type="button"
            className={`lb-sm lb-pin${pinned ? " on" : ""}`}
            title={pinned ? "Unpin" : "Pin to top"}
            aria-label={pinned ? "Unpin" : "Pin to top"}
            aria-pressed={pinned}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              pinFx(e.currentTarget);
              togglePin();
            }}
          >
            <PinGlyph />
          </button>
        )}
      </div>
    );
  }

  /** Overview (Home), and About / Settings at the foot — rows of the same make as the library's. */
  const fixedRow = (kind: "overview" | "about" | "settings", title: string, sub: string | null, sel: boolean, go: () => void): ReactNode => (
    <div
      role="button"
      tabIndex={0}
      aria-current={sel ? "page" : undefined}
      title={compact ? title : undefined}
      onClick={(e) => {
        flashRow(e.currentTarget);
        const ib = e.currentTarget.querySelector(".lb-ib");
        if (ib) libFx[kind](ib);
        go();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          go();
        }
      }}
      onContextMenu={(e) => e.stopPropagation()}
      className={`lb-row select-none ${sel ? "sel" : ""}${sub === null && kind !== "overview" ? " lb-row-lean" : ""}${kind === "overview" ? " lb-row-home" : ""}`}
    >
      <span className="lb-ib"><LibIcon kind={kind} on={sel} /></span>
      <div className="lb-tx">
        <b>{title}</b>
        {sub !== null && <small>{sub}</small>}
      </div>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className={`lb${compact ? " lb-compact" : ""} relative flex-1 min-h-0 flex flex-col glass-pill rounded-2xl overflow-hidden shadow-pill transition-shadow ${
        libHover ? "shadow-[0_0_44px_rgb(var(--accent)/0.14)]" : ""
      }`}
      onContextMenu={onLibraryContextMenu}
      onDragOver={(e) => {
        if (!dragHasPlaylist(e) && !dragHasArtist(e) && !dragHasAlbum(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        refreshGlow();
      }}
      onDragLeave={(e) => {
        if (dragHasPlaylist(e) || dragHasArtist(e) || dragHasAlbum(e)) refreshGlow();
      }}
      onDrop={(e) => {
        clearGlow();
        const isPlaylist = dragHasPlaylist(e);
        const isArtist = !isPlaylist && dragHasArtist(e);
        const isAlbum = !isPlaylist && !isArtist && dragHasAlbum(e);
        if (!isPlaylist && !isArtist && !isAlbum) return;
        e.preventDefault();
        if (isPlaylist) {
          const pl = readPlaylist(e);
          if (!pl) return;
          // Local playlists dropped on the panel background are already
          // home — filing happens on folders, not here.
          const name = localPlaylistName(pl.id);
          if (name) {
            useUI.getState().toast(`“${name}” is already in your library`);
            return;
          }
          void importPlaylist(pl);
        } else if (isAlbum) {
          const al = readAlbum(e);
          if (al) void importAlbum(al);
        } else {
          const ar = readArtist(e);
          if (ar) followDroppedArtist(ar);
        }
      }}
    >
      {/* The whole-panel glow while a playlist/artist hovers over the panel. */}
      {libHover && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2 ring-inset ring-accent/50 bg-accent/[0.05]"
        />
      )}
      <LibraryBloom host={panelRef} compact={compact} />
      {/* Header */}
      <div className="lb-head lb-above flex items-center justify-between pl-[18px] pr-3 pt-3.5 h-[48px]">
        <button
          onClick={(e) => {
            bookFx(e.currentTarget);
            navigate({ name: "library" });
          }}
          className="flex items-center gap-2.5 text-[14px] font-semibold text-white tracking-[.01em]"
          title="Your Library"
        >
          <span className="lb-head-ico"><BookGlyph /></span>
          <span className="lb-head-tx">Your Library</span>
        </button>
        {/* + opens the create dropdown — Playlist / Folder, no modal. */}
        <div className="lb-head-plus">
          <CreateMenu variant="eye" />
        </div>
      </div>

      {/* a long line under the header, so the menus below read as their own group */}
      <div className="lb-sep lb-sep-long lb-above lb-sep-top" />

      <div className="lb-above pt-1">
        {/* Home first, then the library's own shelves, always together, in this order: one list, one set of rows */}
        <div className="px-1 space-y-0.5">
          {fixedRow("overview", "Home", null, view.name === "home", () => navigate({ name: "home" }))}
          {singles.map((r) => renderRow(r, undefined))}
        </div>
        {/* a long line, and below it only the playlists you made (and the artists and folders you keep) */}
        <div className="lb-sep lb-sep-long" />
      </div>

      {/* Rows — drops bubble to the panel root, which imports playlists and
          artists anywhere they land; specific rows handle their own targets. */}
      <div ref={scrollRef} className="lb-above edge-fades flex-1 min-h-0 overflow-y-auto px-1 pb-2">
        {entries.length === 0 ? (
          <div className="lb-empty">No playlists yet</div>
        ) : (
          <div ref={rowsRef} className="space-y-0.5">
            {entries.map((entry, i) => (
              <div
                key={entry.key}
                style={sortable.styleFor(i)}
                tabIndex={-1}
                // Alt+↑/↓ refocuses the moved entry: hand that on to its row.
                onFocus={(e) => {
                  if (e.target === e.currentTarget) (e.currentTarget.firstElementChild as HTMLElement | null)?.focus();
                }}
                className="space-y-0.5 rounded-lg outline-none"
              >
                {entry.rows.map((r, j) => renderRow(r, j === 0 && i >= fixed.length ? sortable.rowProps(i) : undefined))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="lb-foot lb-above">
        {fixedRow("about", "About", null, floating === "about", () => useUI.getState().openFloating("about"))}
        {fixedRow("settings", "Settings", null, view.name === "settings", () => useUI.getState().openSettings())}
      </div>
    </div>
  );
}

/* ============================================================ root */

/** The library's width: open (328 to start with, 250 to 480 when pulled) or a narrow strip of icons and covers. */
const LIB_KEY = "blutheist.libraryWidth";
const LIB_STRIP = 62;
const LIB_OPEN = 328;
const LIB_MIN = 250;
const LIB_MAX = 480;
/** Pulled narrower than this, the library lets go of its words and shows only icons. */
const LIB_SNAP = 150;

function readLibraryWidth(): number {
  try {
    const v = Number(localStorage.getItem(LIB_KEY));
    if (v === LIB_STRIP) return LIB_STRIP;
    if (Number.isFinite(v) && v >= LIB_MIN && v <= LIB_MAX) return Math.round(v);
  } catch {
    /* no storage: the default */
  }
  return LIB_OPEN;
}

const settleWidth = (w: number): number => (w < LIB_SNAP ? LIB_STRIP : Math.min(LIB_MAX, Math.max(LIB_MIN, Math.round(w))));

export function Sidebar() {
  const [w, setW] = useState(readLibraryWidth);
  const [pulling, setPulling] = useState(false);
  const from = useRef<{ x: number; w: number; id: number } | null>(null);
  const live = useRef(w);
  live.current = w;
  const compact = w < LIB_SNAP;

  const keep = (next: number): void => {
    setW(next);
    try {
      localStorage.setItem(LIB_KEY, String(next));
    } catch {
      /* the width still holds for this run */
    }
  };

  return (
    <aside
      className={`lb-aside relative shrink-0 flex flex-col min-h-0${pulling ? " is-pulling" : ""}`}
      style={{ width: w }}
    >
      <LibraryPill compact={compact} />
      {/* The edge (and the corners with it): take hold and pull to make the library wider or narrower; let go
          and it settles; a double tap opens or folds it. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize your library"
        aria-valuemin={LIB_STRIP}
        aria-valuemax={LIB_MAX}
        aria-valuenow={w}
        tabIndex={0}
        className="lb-grip"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          from.current = { x: e.clientX, w: live.current, id: e.pointerId };
          setPulling(true);
        }}
        onPointerMove={(e) => {
          const f = from.current;
          if (!f || f.id !== e.pointerId) return;
          setW(Math.min(LIB_MAX, Math.max(LIB_STRIP, f.w + (e.clientX - f.x))));
        }}
        onPointerUp={(e) => {
          const f = from.current;
          if (!f || f.id !== e.pointerId) return;
          from.current = null;
          setPulling(false);
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }
          keep(settleWidth(live.current));
        }}
        onPointerCancel={() => {
          from.current = null;
          setPulling(false);
          keep(settleWidth(live.current));
        }}
        onDoubleClick={() => keep(live.current < LIB_SNAP ? LIB_OPEN : LIB_STRIP)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            keep(live.current <= LIB_MIN ? LIB_STRIP : settleWidth(live.current - 24));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            keep(live.current < LIB_SNAP ? LIB_MIN : settleWidth(live.current + 24));
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            keep(live.current < LIB_SNAP ? LIB_OPEN : LIB_STRIP);
          }
        }}
      />
    </aside>
  );
}
