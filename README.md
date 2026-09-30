# saystack

Voice I/O for LLM chat UIs. Turn model output into speakable text, chunk it so playback can start
before the answer finishes, highlight the words as they are read, and capture speech back — against
any OpenAI-compatible TTS/STT engine.

It is a set of small, separately installable pieces rather than a framework. `@saystack/core` has no
runtime dependencies and no vendor knowledge; engines and UI plug into its contracts.

## What it does

- **Speakable text.** Strip markdown, code, tables and rules out of a reply, split it into blocks and
  chunk it for streaming playback — so audio starts before the reply is complete.
- **Read-along.** Map the words being spoken onto the words on screen and highlight them, including
  word-level timings when the engine provides them.
- **Dictation.** Stream recognised words into a composer as they are said, with a realtime WebSocket
  path and a plain upload path.
- **A voice UI.** A spectral aura that reacts to the voice, a read-aloud player, a per-message speaker
  button, mobile dictation/read-aloud spotlights.
- **Engines behind a seam.** `ISttAdapter`, `ITtsAdapter` and `ISttRealtimeAdapter` are the only things
  an engine must implement.

## Packages

| Package                                                                   | What it is                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`@saystack/core`](packages/core)                                         | Engine-agnostic core: text, chunking, sessions, timings, aura and audio maths. No runtime dependencies.  |
| [`@saystack/web`](packages/web)                                           | Browser audio: WebAudio unlock, recording, PCM capture, read-along over live DOM ranges, the WebGL aura. |
| [`@saystack/react`](packages/react)                                       | Shared React state for speech and dictation. Not bound to any platform.                                  |
| [`@saystack/react-web`](packages/react-web)                               | React components and hooks for the web: read-aloud, the player, dictation, the aura.                     |
| [`@saystack/react-native`](packages/react-native)                         | The same ideas for React Native: spotlights, captions, native recording and playback.                    |
| [`@saystack/server`](packages/server)                                     | Optional Hono routes and a realtime WebSocket bridge that keep engine tokens on the server.              |
| [`@saystack/engine-openai-compatible`](packages/engine-openai-compatible) | An engine for any OpenAI-compatible `/v1` audio server (reference implementation: oMLX).                 |

## Layout

```
core                     text, chunking, sessions, aura maths        no deps, no DOM
 ├── web                 the browser implementation
 ├── engine-openai-…     an engine implementation
 └── react               shared React state
      ├── react-web      web components
      └── react-native   native components
server                   optional HTTP + websocket layer
examples/voice-chat      a complete chat wired end to end
playground               hand-written labs for the animations (not published)
```

Dependencies only ever point downward, and `core` never learns about a vendor or a platform.

## Getting started

```bash
pnpm install
pnpm -r build
```

Every check at once:

```bash
pnpm check     # lint, format, typecheck, build, test, knip
```

The full example needs an OpenAI-compatible speech server for STT/TTS and a chat endpoint for replies —
see [`examples/voice-chat`](examples/voice-chat):

```bash
OMLX_TOKEN=… LLM_TOKEN=… pnpm --filter @saystack/example-voice-chat dev
```

### Minimal read-aloud

```tsx
import { ReadAloudProvider, ReadAloudPlayer, useReadAloudMessage } from "@saystack/react-web";
import "@saystack/react-web/styles.css";

function Reply({ id, markdown }: { id: string; markdown: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { phase, speak, stop } = useReadAloudMessage(id, ref);
  const isSpeaking = phase === "playing" || phase === "paused";

  const handleClick = (): void => {
    if (isSpeaking) {
      stop();
      return;
    }

    speak(markdown);
  };

  return (
    <div ref={ref}>
      <button onClick={handleClick}>{isSpeaking ? "Stop" : "Read"}</button>
      <Markdown source={markdown} />
    </div>
  );
}

export function App({ children }: { children: ReactNode }) {
  return (
    <ReadAloudProvider endpoint="/api/tts" headers={() => ({ authorization: token })} summarize={summarize}>
      {children}
      <ReadAloudPlayer />
    </ReadAloudProvider>
  );
}
```

`endpoint` and `headers` describe _your_ backend. `summarize` lets the server decide what a long reply
should sound like before it is spoken: it receives `(id, markdown, signal)` and returns the shorter text
to speak instead, or `null` to speak the reply as written.

## Developing

- Package code is TypeScript, ESM only, built with `tsc`. No bundler.
- `pnpm format` and `pnpm lint` before pushing; CI runs format, lint, typecheck, build, test and knip.
- `pnpm knip` finds unused files, exports and dependencies. Public library surface is configured in
  [`knip.json`](knip.json).
- Releases use [Changesets](.changeset): `pnpm changeset`, then merge the version pull request.

## License

MIT
