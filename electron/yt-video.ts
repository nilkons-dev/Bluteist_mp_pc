/**
 * A pasted YouTube link becomes a Blutheist song: the video's own details (title, channel, length, picture) are
 * read from the player response and shaped like any other track, so it plays, likes, queues and joins playlists
 * exactly as a search result does. Pure logic — the network call lives in music-service.ts.
 */
import type { Track } from "../src/types";

/** What the player response carries for a video; every field is optional because YouTube's shapes drift. */
export interface VideoInfoLike {
  basic_info?: {
    id?: string;
    title?: string;
    author?: string;
    channel?: { id?: string; name?: string } | null;
    channel_id?: string;
    duration?: number;
    thumbnail?: unknown;
    is_live?: boolean;
    is_upcoming?: boolean;
    is_post_live_dvr?: boolean;
  };
  playability_status?: { status?: string; reason?: string };
}

/** The listener-facing reason a link can't become a song. */
export class VideoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoUnavailableError";
  }
}

/** A valid video id: eleven URL-safe characters. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** "Artist - Topic" is YouTube's auto-generated channel for a catalogue artist: the artist is the name before it. */
export function cleanChannelName(name: string): string {
  return name.replace(/\s*-\s*Topic$/i, "").trim();
}

/**
 * Shapes a player response into a track. Throws VideoUnavailableError for a video that can't be played here
 * (private, removed, region-blocked, a live stream or a premiere that hasn't started).
 */
export function trackFromVideoInfo(info: VideoInfoLike | null | undefined, id: string, bestThumb: (t: unknown) => string): Track {
  const basic = info?.basic_info;
  const status = info?.playability_status?.status;
  const reason = info?.playability_status?.reason?.trim();
  if (!basic || !basic.title) {
    throw new VideoUnavailableError(reason || "This video isn't available.");
  }
  if (status && status !== "OK" && status !== "LIVE_STREAM_OFFLINE" && status !== "CONTENT_CHECK_REQUIRED") {
    throw new VideoUnavailableError(reason || "This video can't be played.");
  }
  if (basic.is_live || basic.is_post_live_dvr) throw new VideoUnavailableError("Live streams can't be played as songs.");
  if (basic.is_upcoming) throw new VideoUnavailableError("This video hasn't started yet.");
  const channel = cleanChannelName(basic.author || basic.channel?.name || "") || "YouTube";
  const duration = Number.isFinite(basic.duration) && (basic.duration as number) > 0 ? Math.round(basic.duration as number) : 0;
  const channelId = basic.channel_id || basic.channel?.id || "";
  return {
    id,
    title: basic.title.trim(),
    artist: channel,
    ...(channelId.startsWith("UC") ? { artistId: channelId } : {}),
    duration,
    thumb: bestThumb(basic.thumbnail) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}
