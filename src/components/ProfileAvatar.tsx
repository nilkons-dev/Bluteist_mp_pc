/**
 * The round profile picture: the one the person has (or was given at random), and the coloured letter until it is
 * there. The top bar's button and the account card in Settings draw the same one.
 */
import { useSession, shownName } from "../lib/session";
import { avatarFor } from "../lib/avatar";
import { useMyAvatar } from "../stores/avatar";
import "./avatars.css";

export function ProfileAvatar({ size, className = "" }: { size: number; className?: string }) {
  const mode = useSession((s) => s.mode);
  const username = useSession((s) => s.username);
  const displayName = useSession((s) => s.displayName);
  const { src } = useMyAvatar();
  const { color, letter } = avatarFor(mode, username, shownName({ mode, username, displayName }));
  return (
    <span aria-hidden className={`av-pic ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.46), backgroundColor: src ? "#151515" : color }}>
      {src ? <img src={src} alt="" draggable={false} /> : letter}
    </span>
  );
}
