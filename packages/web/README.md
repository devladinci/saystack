# @saystack/web

The browser side of saystack, without a framework. It plays speech through WebAudio, highlights the words on the
page as they are read, records and streams the microphone, and draws the spectral aura with WebGL.

Use it in a plain web app, or to bind saystack to a framework. React apps use `@saystack/react-web`, which wraps
it.

## Install

```bash
npm install @saystack/web @saystack/core
```

`@saystack/core` is only needed directly for `createSpeechSession`, which the first example uses.

## Read a reply aloud

```ts
import "@saystack/web/styles.css";

import { createSpeechSession } from "@saystack/core";
import { createReadAlong, createWebTtsDriver, unlockWebAudio } from "@saystack/web";

const session = createSpeechSession(createWebTtsDriver({ endpoint: "/voice/speech" }));

export async function readAloud(reply: Element, markdown: string): Promise<void> {
  const readAlong = createReadAlong(reply, {
    onSeek: ({ chunkIndex, seconds }) => session.seek(chunkIndex, seconds),
  });
  const unsubscribe = session.subscribe(() => readAlong.setChunks(session.state.chunks));
  let frame = 0;

  const follow = (): void => {
    readAlong.setPosition(session.position());
    frame = requestAnimationFrame(follow);
  };

  unlockWebAudio();
  frame = requestAnimationFrame(follow);
  await session.speak(markdown);
  cancelAnimationFrame(frame);
  unsubscribe();
  readAlong.destroy();
}
```

Call it from a click, so the browser lets audio play. `endpoint` receives `{ text }` as JSON and returns audio,
which is what `@saystack/server` serves. Clicking a word while it plays seeks there.

## The aura

```ts
import { createAudioLevels, createAura, unlockWebAudio } from "@saystack/web";

export async function glowWhileListening(button: Element): Promise<() => void> {
  unlockWebAudio();
  const levels = createAudioLevels();
  const aura = createAura({ anchor: button, levels: () => levels.read() });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const stopListening = levels.listen(stream);

  aura.setState("active");

  return () => {
    stopListening();
    aura.destroy();
    levels.dispose();
    stream.getTracks().forEach((track) => track.stop());
  };
}
```

Also in the package: `createWebRecorder`, `capturePcm` and `startRealtimeTranscription` for dictation,
`createStreamingInput` and `createFieldInput` to write dictated words into a field as they arrive, and
`createSpectrumLine`. The styles use CSS variables such as `--saystack-word-background` that you can override.

## Related packages

[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/react-web`](https://www.npmjs.com/package/@saystack/react-web),
[`@saystack/server`](https://www.npmjs.com/package/@saystack/server),
[`@saystack/engine-openai-compatible`](https://www.npmjs.com/package/@saystack/engine-openai-compatible).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
