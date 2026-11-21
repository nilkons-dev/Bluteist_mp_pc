/**
 * Home — a personalized feed, not a fixed page.
 *
 * This view holds no recommendation logic of its own: sections come from
 * lib/recs (profile → candidates → section builder → feed hook), and each
 * section self-describes its title, subtitle, layout and items. The view's
 * whole job is to render whatever the engine chose — new section types and
 * reorderings appear without touching this file.
 *
 * Visual language follows the reference layouts: stacked song rows, square
 * album/track cards, circular artist cards, mix cards with name bands, and
 * pastel radio tiles with contextual "reason" subtitles.
 */
import { useEffect, useRef, useState } from "react";
import { AlbumCard, ArtistCard, HomeShelfView, TrackCard } from "../components/Cards";
import { Crate } from "../components/Crate";
import { EyebrowHeader, MixCard, RadioCard, SideCard, TrackColumns, homeTrackMenu } from "../components/recCards";
import { Shelf, ShelfScroller, ShelfSkeleton } from "../components/primitives";
import { useHomeFeed } from "../lib/recs/feed";
import type { HomeSection, SectionItem } from "../lib/recs/sections";
import { useHomeEngagement } from "../stores/homeEngagement";
import { useUI } from "../stores/ui";

/** Cold-start browse chips — the honest fallback while taste is unknown. */
function MoodChips({ moods }: { moods: string[] }) {
  const setQuery = useUI((s) => s.setSearchQuery);
  const navigate = useUI((s) => s.navigate);
  return (
    <div className="flex flex-wrap gap-2">
      {moods.map((mood) => (
        <button
          key={mood}
          onClick={() => {
            setQuery(mood);
            navigate({ name: "search" });
          }}
          className="px-4 py-2 rounded-full bg-ink-hi/[0.05] text-[13px] font-medium text-ink hover:bg-ink-hi/[0.09] hover:text-ink-hi transition-colors duration-150"
        >
          {mood}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders one section however it asks to be rendered. Adding a new section
 * type = a new entry in the builder + (only if genuinely new) a new case here.
 */
function SectionView({ section }: { section: HomeSection }) {
  const navigate = useUI((s) => s.navigate);

  const eyebrow = section.eyebrow;
  const openArtist = eyebrow ? () => navigate({ name: "artist", param: eyebrow.artistId }) : undefined;

  if (section.layout === "yt-shelf" && section.shelf) {
    return <HomeShelfView shelf={section.shelf} />;
  }
  if (section.layout === "crate" && section.playlists) {
    return <Crate title={section.title} playlists={section.playlists} className="animate-slide-up" />;
  }

  if (section.layout === "songrows" && section.rows) {
    return (
      <Shelf title={section.title} subtitle={section.subtitle}>
        {/* Four rows packed close, so the page reads as one big wall of songs. */}
        <div className="song-rows">
          {section.rows.map((row, r) => (
            <ShelfScroller key={`${section.id}-${r}`} className="song-row">
              {row.map((track) => (
                <TrackCard key={`${r}-${track.id}`} track={track} menu={() => homeTrackMenu(track)} />
              ))}
            </ShelfScroller>
          ))}
        </div>
      </Shelf>
    );
  }

  const body = (() => {
    if (section.layout === "moods") {
      return <MoodChips moods={section.moods ?? []} />;
    }
    if (section.layout === "list") {
      return <TrackColumns items={section.items.flatMap((it) => (it.style === "track" ? [it] : []))} />;
    }
    return (
      <ShelfScroller>
        {section.items.map((item, i) => {
          const key = `${section.id}-${item.style}-${i}`;
          switch (item.style) {
            case "track":
              return <TrackCard key={key} track={item.track} menu={() => homeTrackMenu(item.track)} />;
            case "album":
              return <AlbumCard key={key} album={item.album} />;
            case "artist":
              return <ArtistCard key={key} artist={item.artist} />;
            case "mix":
              return <MixCard key={key} item={item} />;
            case "side":
              return <SideCard key={key} item={item} />;
            case "radio":
              return <RadioCard key={key} item={item} />;
            default:
              return null;
          }
        })}
      </ShelfScroller>
    );
  })();

  return (
    <section className="animate-slide-up">
      {eyebrow ? (
        <>
          <EyebrowHeader eyebrow={eyebrow} onOpen={openArtist as () => void} />
          {body}
        </>
      ) : (
        <Shelf title={section.title} subtitle={section.subtitle}>
          {body}
        </Shelf>
      )}
    </section>
  );
}

/** A stable id for a section item, whichever variant of the union it is (used to detect swapped songs). */
function firstItemKey(item: SectionItem): string {
  switch (item.style) {
    case "track":
      return item.track.id;
    case "album":
      return item.album.id;
    case "artist":
      return item.artist.id;
    default:
      return item.id;
  }
}

/** "Good morning" / "Good afternoon" / "Good evening" by the hour on this computer's clock. */
function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeView() {
  const { sections, profile } = useHomeFeed();
  // The greeting follows the clock: checked every few minutes, so a Home left open through noon turns over by itself.
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setGreeting(greetingFor(new Date())), 300_000);
    return () => window.clearInterval(id);
  }, []);
  // A refresh (the TopBar button) swaps the songs under the same rows and lets them settle in with one soft fade of the
  // whole page — nothing is torn down and rebuilt, so it stays smooth. The fade plays when the press happens and
  // again once the new songs have arrived.
  const refresh = useUI((s) => s.homeReloadNonce);
  const rootRef = useRef<HTMLDivElement>(null);
  const waiting = useRef(false);
  const signature = sections.map((x) => `${x.id}:${x.items.length}:${x.items[0] ? firstItemKey(x.items[0]) : ""}`).join("|");
  const fade = (): void => {
    const el = rootRef.current;
    if (!el) return;
    el.classList.remove("home-swap");
    void el.offsetWidth;
    el.classList.add("home-swap");
  };
  useEffect(() => {
    if (!refresh) return;
    waiting.current = true;
    fade();
  }, [refresh]);
  useEffect(() => {
    if (!waiting.current) return;
    waiting.current = false;
    fade();
  }, [signature]);
  // The glow at the top of the pane is global (components/CoverGlow): at rest
  // it shows the playing track's cover, and hovering any card on any view
  // shows that card's artwork instead.

  return (
    <div ref={rootRef} className="relative">
      <h1 className="font-display text-[30px] font-extrabold tracking-tight text-ink-hi leading-none mb-5">{greeting}</h1>
      <div className="relative space-y-7">
        {sections.map((section) => (
          // A press inside a row counts for its kind: the rows you play from rise on your next visit.
          <div
            key={section.id}
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("button, [role='button'], a")) useHomeEngagement.getState().tap(section.kind);
            }}
          >
            <SectionView section={section} />
          </div>
        ))}

        {/* Stats still loading on a cold app launch — hold the layout. */}
        {!profile && (
          <div className="space-y-7">
            <ShelfSkeleton />
            <ShelfSkeleton />
          </div>
        )}
      </div>
    </div>
  );
}
