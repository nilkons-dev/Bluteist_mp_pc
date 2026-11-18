/**
 * The equalizer's board: presets, ten band sliders and "Prevent clipping". Shared by Settings and the floating
 * equalizer window opened from the now-playing panel, so both edit the same saved curve.
 */
import { useRef, type CSSProperties } from "react";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { Switch } from "./primitives";
import { EQ_BANDS } from "../lib/audio";
import { EQ_RANGE, eqY } from "../lib/eqScale";

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Vocal: [-2, -2, -1, 0, 2, 4, 4, 2, 0, -1],
  Loudness: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
};

const bandLabel = (hz: number): string => (hz >= 1000 ? `${hz / 1000}k` : String(hz));
const dB = (g: number): string => `${g > 0 ? "+" : ""}${g} dB`;

/** A band's gain as it reads over the band: +3, 0, −2 (a real minus). */
const gainText = (g: number): string => (g > 0 ? `+${g}` : g < 0 ? `−${-g}` : "0");

/** The bands' sliders and the thumb they travel with, px (index.css .st-eq-band input), and the
    board's rules, dB. */
const EQ_H = 160;
const EQ_THUMB = 16;
const EQ_RULES = [12, 6, 0, -6, -12];

/**
 * 10-band graphic EQ, a line per band: each a real vertical slider (±12 dB, double-click for 0) with
 * its gain over it and its frequency under it, on a board ruled every 6 dB, so the keyboard and screen
 * readers get real sliders. Presets above it (built in, and your own: right-click to rename, update or
 * delete), "Prevent clipping" under it. Off, it stays on view, dimmed. Nothing in it changes size while
 * a band moves, so a drag never shifts it under the pointer: Save as preset is always there (off while
 * the curve is a preset), and the note doesn't name the preset.
 */
export function EqualizerBoard() {
  const enabled = useSettings((st) => st.eqEnabled);
  const gains = useSettings((st) => st.eqGains);
  const saved = useSettings((st) => st.eqPresets);
  const autoHeadroom = useSettings((st) => st.eqAutoHeadroom);
  const { setEqEnabled, setEqGains, saveEqPreset, renameEqPreset, deleteEqPreset, setEqAutoHeadroom } = useSettings.getState();
  const eqRef = useRef<HTMLDivElement>(null);
  const same = (curve: number[]): boolean => curve.every((g, i) => g === gains[i]);
  const builtIn = Object.keys(EQ_PRESETS).find((k) => same(EQ_PRESETS[k]));
  const mine = saved.find((p) => same(p.gains))?.name;
  const preset = builtIn ?? mine;
  const zero = eqY(0, EQ_H, EQ_THUMB);
  const setBand = (i: number, g: number): void => setEqGains(gains.map((v, j) => (j === i ? g : v)));

  // While a band is dragged, its knob and fill follow the pointer without easing; a preset eases.
  const hold = (): void => {
    const eq = eqRef.current;
    if (!eq) return;
    eq.classList.add("is-dragging");
    const done = (): void => {
      eq.classList.remove("is-dragging");
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
    };
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
  };

  const askName = (title: string, initialValue: string, confirmLabel: string, done: (name: string) => void, except = ""): void =>
    useUI.getState().openDialog({
      title,
      initialValue,
      placeholder: "Preset name",
      confirmLabel,
      onConfirm: (value) => {
        const name = value.trim().slice(0, 40);
        if (!name) return;
        if (EQ_PRESETS[name]) {
          useUI.getState().toast(`"${name}" is a built-in preset. Pick another name`, "error");
          return;
        }
        if (name !== except && saved.some((p) => p.name === name)) {
          useUI.getState().toast(`You already have a preset called "${name}"`, "error");
          return;
        }
        done(name);
      },
    });

  return (
    <div ref={eqRef} className={`st-eq${enabled ? "" : " is-off"}`}>
      <div className="st-eq-presets">
        {Object.keys(EQ_PRESETS).map((name) => (
          <button
            key={name}
            type="button"
            disabled={!enabled}
            aria-pressed={name === preset}
            onClick={() => setEqGains(EQ_PRESETS[name])}
            className="st-chip"
          >
            {name}
          </button>
        ))}
        {saved.map((p) => (
          <button
            key={`mine-${p.name}`}
            type="button"
            disabled={!enabled}
            aria-pressed={p.name === preset}
            onClick={() => setEqGains(p.gains)}
            onContextMenu={(e) => {
              e.preventDefault();
              useUI.getState().openContextMenu(e.clientX, e.clientY, [
                { label: "Rename", action: () => askName("Rename preset", p.name, "Rename", (to) => renameEqPreset(p.name, to), p.name) },
                { label: "Update to current curve", disabled: same(p.gains), action: () => saveEqPreset(p.name, gains) },
                { label: "Delete", danger: true, separatorBefore: true, action: () => deleteEqPreset(p.name) },
              ]);
            }}
            title="Right-click to rename, update or delete"
            className="st-chip"
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          disabled={!enabled || preset !== undefined}
          onClick={() => askName("Save preset", "My preset", "Save", (name) => saveEqPreset(name, gains))}
          className="st-chip is-new"
        >
          Save as preset
        </button>
      </div>
      <div className="st-eq-board" onPointerDown={hold}>
        <div className="st-eq-bands">
          <div aria-hidden className="st-eq-rules" style={{ height: EQ_H }}>
            {EQ_RULES.map((g) => (
              <span key={g} className={g === 0 ? "is-zero" : undefined} style={{ top: eqY(g, EQ_H, EQ_THUMB) }}>
                <b>{gainText(g)}</b>
              </span>
            ))}
          </div>
          {EQ_BANDS.map((hz, i) => {
            const g = gains[i] ?? 0;
            const y = eqY(g, EQ_H, EQ_THUMB);
            const place = { height: EQ_H, "--y": `${y}px`, "--top": `${Math.min(y, zero)}px`, "--len": `${Math.abs(y - zero)}px` };
            return (
              <label key={hz} className={`st-eq-band${g ? " is-set" : ""}`} onDoubleClick={() => enabled && setBand(i, 0)}>
                <span aria-hidden className="st-eq-gain">
                  {gainText(g)}
                </span>
                <span className="st-eq-rail" style={place as CSSProperties}>
                  <input
                    type="range"
                    min={-EQ_RANGE}
                    max={EQ_RANGE}
                    step={1}
                    value={g}
                    disabled={!enabled}
                    aria-label={`${bandLabel(hz)} Hz`}
                    aria-valuetext={dB(g)}
                    // In px, not 100%: a vertical slider's percentage height resolves against the
                    // window, which would stretch its travel far past the rail and the knob.
                    style={{ height: EQ_H }}
                    onChange={(e) => setBand(i, Number(e.target.value))}
                  />
                  <span aria-hidden className="st-eq-fill" />
                  <span aria-hidden className="st-eq-knob" />
                </span>
                <span aria-hidden className="st-eq-hz">
                  {bandLabel(hz)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="st-eq-clip">
        <span className="st-eq-clip-text">
          <span className="st-eq-clip-title">Prevent clipping</span>
          <span className="st-eq-clip-note">Lowers the level only when your boosts would distort at the current volume</span>
        </span>
        <Switch checked={autoHeadroom} onChange={setEqAutoHeadroom} disabled={!enabled} label="Prevent clipping" />
      </div>
    </div>
  );
}
