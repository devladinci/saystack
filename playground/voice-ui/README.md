# Voice UI lab

A playground for saystack's voice animations, not a package: the spectral aura
for dictation and read-aloud, streaming words into an input, word-by-word
read-along, and the read-aloud player. No build step and no dependencies.

```bash
python3 playground/voice-ui/serve.py
```

Open http://localhost:5178. The server turns caching off, so a reload picks up edits. The microphone needs `localhost` (or https). In
Chrome and Safari the words also stream in through the browser's speech
recognition; elsewhere only the aura runs. **Voice → Demo clip** in the panel
replays a recorded dictation instead of the mic.

## What is where

| File | What it does |
| --- | --- |
| `src/aura.js` | WebGL outline of light around any element, or the page edges when there is none. One line per band; lines add up to white on dark backgrounds and average to grey on light ones. |
| `src/bands.js` | Splits audio into 5–8 log-spaced bands with one shared gain, so the spectrum keeps its shape. |
| `src/palette.js` | Band colors, evenly spaced OKLCH hues. |
| `src/readAlong.js` | Wraps a message's words in spans, treats code, tables and images as blocks, and moves the word highlight from engine word marks. |
| `src/streamInput.js` | Mirror layer over a textarea that shows new and interim words while they stream in. |
| `src/player.js`, `src/miniWave.js` | The read-aloud player and its small spectrum. |
| `src/speech.js`, `src/dictation.js` | The playback session and the dictation sources for the demo. |

`assets/*.m4a` and `assets/*.json` are the demo voice clips with per-word marks
(char offset, length, seconds) for each spoken segment. They were rendered with
macOS `AVSpeechSynthesizer`, which reports word marks while it writes audio.
