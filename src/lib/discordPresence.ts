/**
 * Keeps the Discord "Listening to" status in step with the player.
 *
 * The main process owns the connection (electron/discord-rpc.ts); this side only reports what is playing:
 * the song when it starts, when it resumes, and when the listener seeks. Pausing or stopping clears the status.
 * Position ticks (about 4 a second) are NOT sent: main extrapolates the time bar itself, and a tick is only
 * reported when it jumps away from where the bar would be (a seek).
 */
import { usePlayer, shownTrack } from "../stores/player";
import { useSettings } from "../stores/settings";
import { afterIntro } from "./introGate";

const SEEK_JUMP_SEC = 3;

export function watchDiscord(): () => void {
  const bridge = window.bytune;
  if (!bridge?.discordConfigure) return () => undefined;
  let stopped = false;
  let unsubs: Array<() => void> = [];

  let key = "";
  let reportedPos = 0;
  let reportedAt = 0;

  const report = (): void => {
    const { enabled } = config();
    if (!enabled) return;
    const p = usePlayer.getState();
    const track = shownTrack(p);
    if (!track || !p.playing || track.localPath) {
      // Nothing is playing (or it is a private file on this computer): no status.
      if (key !== "") {
        key = "";
        void bridge.discordSetSong(null).catch(() => undefined);
      }
      return;
    }
    const nextKey = track.id;
    const now = Date.now();
    const expected = reportedPos + (now - reportedAt) / 1000;
    if (nextKey === key && Math.abs(p.position - expected) < SEEK_JUMP_SEC) return;
    key = nextKey;
    reportedPos = p.position;
    reportedAt = now;
    void bridge
      .discordSetSong({
        title: track.title,
        artist: track.artist,
        album: track.album,
        durationSec: track.duration,
        positionSec: p.position,
        cover: /^https:\/\//i.test(track.thumb) ? track.thumb : undefined,
      })
      .catch(() => undefined);
  };

  const config = (): { enabled: boolean; appId: string } => {
    const s = useSettings.getState();
    return { enabled: s.discordEnabled, appId: s.discordAppId };
  };

  const apply = (): void => {
    const c = config();
    key = "";
    void Promise.resolve(bridge.discordConfigure(c))
      .catch(() => undefined)
      .then(() => {
        if (!stopped && c.enabled) report();
      });
  };

  // Connecting to Discord waits for the launch intro to finish.
  void afterIntro().then(() => {
    if (stopped) return;
    apply();
    let last = JSON.stringify(config());
    unsubs.push(
      useSettings.subscribe(() => {
        const now = JSON.stringify(config());
        if (now === last) return;
        last = now;
        apply();
      })
    );
    unsubs.push(usePlayer.subscribe(report));
  });

  return () => {
    stopped = true;
    unsubs.forEach((u) => u());
    unsubs = [];
  };
}
