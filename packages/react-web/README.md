# @saystack/react-web

React components and hooks for voice in a web chat: read a reply aloud with its words highlighted, an aura that
follows the voice, a player, and dictation that streams words into the composer.

[Try it in the playground](https://devladinci.github.io/saystack/) before you install.

## Install

```bash
npm install @saystack/react-web react
```

Peer dependency: `react` 19.

## Read aloud

```tsx
import "@saystack/react-web/styles.css";

import { ReadAloudAura, ReadAloudPlayer, ReadAloudProvider, useReadAloudMessage } from "@saystack/react-web";
import { useRef } from "react";

interface IProps {
  id: string;
  text: string;
}

export function Reply({ id, text }: IProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { isActive, speak, stop } = useReadAloudMessage(id, bodyRef);

  const handleClick = (): void => {
    if (isActive) {
      stop();
      return;
    }

    speak(text);
  };

  return (
    <article>
      <div ref={bodyRef}>{text}</div>
      <button type="button" onClick={handleClick}>
        {isActive ? "Stop" : "Read aloud"}
      </button>
    </article>
  );
}

export function App() {
  return (
    <ReadAloudProvider endpoint="/voice/speech">
      <Reply id="welcome" text="Hello. Press the button to hear this reply." />
      <ReadAloudAura />
      <ReadAloudPlayer />
    </ReadAloudProvider>
  );
}
```

The words are marked inside the element you pass to `useReadAloudMessage`, so render your markdown there. One
provider reads one reply at a time across the chat. `endpoint` is your speech route, such as the one
`@saystack/server` serves. The provider also takes `headers` (an object or a function), `rewrite` to turn a reply
with numbers, symbols, links, code or a table into words a voice can read, and `summarize` to read a reply with
code, a table or a lot of text as a shorter one; `shouldRewrite` and `shouldSummarize` change when each one runs.
Instead of `endpoint`, pass `synthesize` to bring the
audio from anywhere else (it still plays through the aura and the player), or a whole `driver` of your own.
`<ReadAloudAura anchor={ref} />` puts the glow around another element, or the page edges with `null`.

## Delivery style

`ReadAloudProvider` also takes a `styleMap`, alongside `rewrite` and `summarize`. When a rewrite or a summary
names a style, it travels to your `endpoint` with the speech, on the channel the map declares — a field in the
request body, or a tag pasted in front of the text:

```tsx
import type { IRewriteFn, IStyleMap } from "@saystack/core";

const styleMap: IStyleMap = {
  channel: { mode: "field", field: "instructions" },
  rules: [{ value: "amused" }, { value: "enthusiastic", label: "excited" }],
};

const rewriteForSpeech: IRewriteFn = async (markdown) => ({ text: markdown, style: "excited" });

<ReadAloudProvider endpoint="/voice/speech" rewrite={rewriteForSpeech} styleMap={styleMap}>
```

saystack ships no styles of its own: `IStyleMap`, imported from `@saystack/core`, holds your vocabulary and one
channel. If that endpoint is `@saystack/server`, the field has to be opened there as well.

## Dictation

```tsx
import { useWebDictation } from "@saystack/react-web";

interface IProps {
  onText: (text: string) => void;
}

export function MicButton({ onText }: IProps) {
  const dictation = useWebDictation({ endpoint: "/voice/audio/transcriptions", onText });
  const isRecording = dictation.state === "recording";

  const handleClick = (): void => {
    if (isRecording) {
      dictation.handlePressEnd();
      return;
    }

    dictation.handlePressStart();
  };

  return (
    <button type="button" disabled={!dictation.isSupported} onClick={handleClick}>
      {isRecording ? "Stop" : "Dictate"}
    </button>
  );
}
```

Add `realtime: { url }` to stream words while they are said, `useFieldInput` to write them into a textarea,
`useDictationAura` for the glow and `useHoldToTalk` for press and hold. `recorder` and `live` replace the microphone
and the realtime socket, for example with the browser's own speech recognition.
[`examples/voice-chat`](https://github.com/devladinci/saystack/tree/main/examples/voice-chat) wires them all.

## Related packages

[`@saystack/react`](https://www.npmjs.com/package/@saystack/react),
[`@saystack/web`](https://www.npmjs.com/package/@saystack/web),
[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/server`](https://www.npmjs.com/package/@saystack/server),
[`@saystack/engine-openai-compatible`](https://www.npmjs.com/package/@saystack/engine-openai-compatible).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
