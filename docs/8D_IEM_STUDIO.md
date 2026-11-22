# 8D audio — IEM Studio (engine v4)

Files: `src/lib/eightD.ts` (engine), `src/stores/settings.ts`, `src/views/SettingsView.tsx`, `src/lib/audio.ts`, `tests/eight-d.test.mjs`.

## What changed
- **Exact stereo image.** The signal is cut into 7 bands as a stereo pair first; mid/side is taken inside each band. Left/right pass through identical filters, so every instrument stays where the mix put it.
- **5 bands per ear** (160–250, 250–700, 700–1.8k, 1.8–4k, 4k+), each drifting on its own phase.
- **IEM tuning curves**: Flat, Harman, Warm, Bright, Vocal, Bassy.
- **Voicings** (one tap): Reference, Harman, Vocal, Bass, Detail, Stage.
- **Detail** (air shelf + sparkle) and **Smooth treble** (stereo de-esser on 4–6.5 kHz and the air band).
- **Fixed**: Web Audio compressors add hidden make-up gain (measured in Chromium: +8.5 dB and +15 dB for the old settings). It is now cancelled, so parallel compression no longer returns a loud, squashed copy.
- **Fixed**: parallel paths are time-aligned (compressor look-ahead is 6 ms), removing comb filtering.
- **Auto level match**: 8D on is never louder than 8D off (loudness-weighted, limited to −15…+3 dB).
- Separation is capped at 1.25× and auto width at +2 dB, because more than that feeds the far ear in anti-phase.

## Tests
`node --test tests/eight-d.test.mjs` (25 tests: the maths). The audio graph itself was also run in headless Chromium (level match within ±0.5 dB on all presets, voice stays centred, hard-panned instruments 9–14 dB stronger in their own ear, tamer transparent when idle).

## Upload to GitHub
```
git checkout -b feature/8d-iem-studio
git add src tests docs
git commit -m "8D: IEM Studio engine (exact imaging, tuning curves, detail, treble smoothing, level match)"
git push -u origin feature/8d-iem-studio
```
Then open a pull request; the existing `build-windows.yml` / `build-mac.yml` workflows build the app.
