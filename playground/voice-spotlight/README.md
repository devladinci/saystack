# Voice spotlight

A playground for saystack's voice spotlight, the mobile idea behind
`@saystack/react-native`, drawn in the browser so it is quick to try:

- **Dictation.** Hold the mic. The chat blurs, the composer stays sharp, the
  aura hangs from the top edge of the screen and the words stream into the
  middle. A long dictation shrinks twice, then scrolls. Let go and the words
  drop into the draft; slide away first to cancel.
- **Read aloud.** Tap the speaker under a reply. The chat blurs, the same
  aura hangs from the top edge while the reply is read, the reply lifts in
  place with the word being read marked, and the player waits at the bottom.
  The blur stays until the reading ends.

The wave is saystack's real aura (`createAura` from
`@saystack/web`), with the same controls, ranges and defaults as the voice lab.
Speech is simulated; nothing uses the microphone.

```bash
pnpm -r build
python3 playground/voice-spotlight/serve.py
```

Open http://localhost:5179/playground/voice-spotlight/. The server turns
caching off and serves the repo, because the page imports the built packages
through an import map. Rebuild the packages to see changes to them.

| File | What it does |
| --- | --- |
| `index.html` | The phone, the chat and the panel of controls. |
| `styles.css` | The phone's two themes, the spotlight's blur and motion. |
| `src/main.js` | Simulated dictation and read-aloud, the aura and its controls. |
