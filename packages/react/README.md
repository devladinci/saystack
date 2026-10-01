# @saystack/react

React state for voice chat that is not tied to a platform: speech and dictation sessions with coded errors.
`@saystack/react-web` and `@saystack/react-native` build their components on it.

Use it directly when you build your own voice UI or bring saystack to another platform. For ready components,
use one of those two packages instead.

## Install

```bash
npm install @saystack/react react
```

Peer dependency: `react` 19.

## Usage

The hooks need two platform pieces: an `ITtsDriver` that fetches and plays speech, and an `IPlatformRecorder`
for the microphone. `@saystack/web` has `createWebTtsDriver` and `createWebRecorder`, and
`@saystack/react-native` has `createNativeTtsDriver` and `createNativeRecorder`.

```tsx
import type { IPlatformRecorder, ITtsDriver } from "@saystack/react";
import { useDictation, useSpeech } from "@saystack/react";

interface IProps {
  driver: ITtsDriver;
  recorder: IPlatformRecorder;
  reply: string;
  onText: (text: string) => void;
}

export function VoiceControls({ driver, recorder, reply, onText }: IProps) {
  const [speech, api] = useSpeech(driver);
  const dictation = useDictation({ recorder, endpoint: "/voice/audio/transcriptions", onText });
  const isRecording = dictation.state === "recording";

  const handleRead = (): void => {
    void api.speak(reply);
  };

  const handleMic = (): void => {
    if (isRecording) {
      dictation.handlePressEnd();
      return;
    }

    dictation.handlePressStart();
  };

  return (
    <div>
      <button type="button" disabled={speech.phase === "loading"} onClick={handleRead}>
        Read aloud
      </button>
      <button type="button" onClick={handleMic}>
        {isRecording ? "Stop" : "Dictate"}
      </button>
      {dictation.state === "error" && <p>{dictation.errorCode}</p>}
    </div>
  );
}
```

`useSpeech` returns the session state (`phase`, `chunks`, `errorCode`) and an api to `speak`, `pause`, `resume`,
`stop` and `seek`. `useDictation` records until `handlePressEnd`, posts the take to `endpoint` as a multipart
`file`, and calls `onText` with the transcript. Errors arrive as codes such as `MIC_PERMISSION_DENIED` or
`ENGINE_UNAVAILABLE`, so the wording stays yours.

`createReadAloud` is the store behind both `ReadAloudProvider`s: one speech session for a whole chat, keyed by
message id.

## Related packages

[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/react-web`](https://www.npmjs.com/package/@saystack/react-web),
[`@saystack/react-native`](https://www.npmjs.com/package/@saystack/react-native),
[`@saystack/server`](https://www.npmjs.com/package/@saystack/server).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
