/**
 * What you search for, as songs.
 *
 * Searching "arijit sad songs" or "lofi" says what kind of music you want right now, in your own words — a signal an
 * artist list can't hold. For your latest few searches the feed asks the catalogue for songs once (a song-only
 * search), keeps them for a while, and lets Home's song rows draw from them. Cached on disk like the artist pages, so
 * a launch paints them at once; a manual refresh marks them stale and they are fetched again (the old copy still
 * paints meanwhile, and stands in if the fetch fails).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { storage } from "../persist";
import { searchPageOnce } from "../searchOnce";
import type { Track } from "../../types";

const TTL_MS = 6 * 3_600_000;
const MAX_QUERIES = 10;
const SONGS_KEPT = 24;
/** How many of the latest searches Home reads. */
export const QUERIES_READ = 3;

interface QueryEntry {
  q: string;
  songs: Track[];
  at: number;
}

interface QueryCacheState {
  byKey: Record<string, QueryEntry>;
  version: number;
  put(key: string, entry: QueryEntry): void;
  bump(): void;
}

export const useQueryCache = create<QueryCacheState>()(
  persist(
    (set, get) => ({
      byKey: {},
      version: 0,
      put(key, entry) {
        const byKey = { ...get().byKey, [key]: entry };
        const keys = Object.keys(byKey);
        if (keys.length > MAX_QUERIES) {
          keys
            .sort((a, b) => byKey[a].at - byKey[b].at)
            .slice(0, keys.length - MAX_QUERIES)
            .forEach((k) => delete byKey[k]);
        }
        set({ byKey, version: get().version + 1 });
      },
      bump() {
        set({ version: get().version + 1 });
      },
    }),
    {
      name: "search-song-cache",
      storage: createJSONStorage(() => storage),
      onRehydrateStorage: () => (state) => {
        state?.bump();
      },
    }
  )
);

export function useQueryCacheVersion(): number {
  return useQueryCache((s) => s.version);
}

let staleBefore = 0;
export function markQueriesStale(): void {
  staleBefore = Date.now();
}

const keyOf = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, " ");

/** A search worth reading as a taste: more than a couple of letters, not a link or a bare number. */
export function usableQuery(q: string): boolean {
  const k = keyOf(q);
  return k.length >= 3 && !/^https?:/.test(k) && !/^\d+$/.test(k);
}

/** The latest searches Home reads, newest first, each once. */
export function latestQueries(searches: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of searches) {
    if (!usableQuery(q)) continue;
    const k = keyOf(q);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
    if (out.length >= QUERIES_READ) break;
  }
  return out;
}

const inflight = new Map<string, Promise<void>>();

/** Songs for each of these searches, fetched when missing, old or marked stale. */
export async function loadQuerySongs(queries: readonly string[]): Promise<void> {
  await Promise.all(
    queries.map((q) => {
      const key = keyOf(q);
      const hit = useQueryCache.getState().byKey[key];
      if (hit && Date.now() - hit.at < TTL_MS && hit.at >= staleBefore) return Promise.resolve();
      const pending = inflight.get(key);
      if (pending) return pending;
      const task = (async () => {
        try {
          const page = await searchPageOnce(q, "songs");
          const songs: Track[] = [];
          for (const row of page.rows) {
            if (row.kind === "track" || row.kind === "top") songs.push(row.song);
          }
          if (songs.length > 0) useQueryCache.getState().put(key, { q: q.trim(), songs: songs.slice(0, SONGS_KEPT), at: Date.now() });
        } catch {
          /* offline: whatever was kept stands */
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, task);
      return task;
    })
  );
}

/** What is kept for these searches: [search, its songs], newest search first; searches with nothing kept are left out. */
export function peekQuerySongs(queries: readonly string[]): Array<{ q: string; songs: Track[] }> {
  const { byKey } = useQueryCache.getState();
  const out: Array<{ q: string; songs: Track[] }> = [];
  for (const q of queries) {
    const e = byKey[keyOf(q)];
    if (e && e.songs.length > 0) out.push({ q: e.q, songs: e.songs });
  }
  return out;
}
