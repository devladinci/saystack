# @saystack/react-native

saystack for React Native and Expo: a dictation spotlight with live captions, a read-aloud spotlight that lifts
the reply and marks its words as they are read, a player, and the spectral aura on the GPU.

## Install

```bash
npm install @saystack/react-native expo-audio expo-file-system expo-modules-core
```

Required peers: `react` 19, `react-native` 0.81 or newer, and `expo-audio`, `expo-file-system` and
`expo-modules-core` 57 or newer. Optional peers: `expo-gl` draws the aura and `expo-blur` blurs the spotlight
backdrop (`npm install expo-gl expo-blur`). Without them the aura is off and a stronger veil stands in for the
blur.

With pnpm, `expo-gl` can pick up an incomplete `react-native-reanimated` and fail at startup. The
[saystack README](https://github.com/devladinci/saystack#react-native) has the `metro.config.js` fix.

## Usage

```tsx
import {
  DictationSpotlight,
  LIGHT_VOICE_THEME,
  ReadAloudProvider,
  ReadAloudSpotlight,
  useHoldToTalk,
  useNativeDictation,
  useReadAloudMessage,
} from "@saystack/react-native";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

const API = "https://api.example.com/voice";

interface IProps {
  id: string;
  text: string;
}

export function Reply({ id, text }: IProps) {
  const bubbleRef = useRef<View | null>(null);
  const { isActive, speak, stop } = useReadAloudMessage(id, bubbleRef);

  const handlePress = (): void => {
    if (isActive) {
      stop();
      return;
    }

    speak(text);
  };

  return (
    <View ref={bubbleRef}>
      <Text>{text}</Text>
      <Pressable onPress={handlePress}>
        <Text>{isActive ? "Stop" : "Read aloud"}</Text>
      </Pressable>
    </View>
  );
}

export function Composer() {
  const [draft, setDraft] = useState("");
  const dictation = useNativeDictation({ endpoint: `${API}/audio/transcriptions`, onInsert: setDraft });
  const hold = useHoldToTalk({
    onStart: dictation.handlePressStart,
    onEnd: dictation.handlePressEnd,
    onCancel: dictation.handleCancel,
  });

  return (
    <View>
      <Text>{draft}</Text>
      <View {...hold.handlers}>
        <Text>Hold to talk</Text>
      </View>
      <DictationSpotlight dictation={dictation} hold={hold} theme={LIGHT_VOICE_THEME} />
    </View>
  );
}

export function App() {
  return (
    <ReadAloudProvider endpoint={`${API}/speech`}>
      <Reply id="welcome" text="Hello. Press the button to hear this reply." />
      <Composer />
      <ReadAloudSpotlight theme={LIGHT_VOICE_THEME} />
    </ReadAloudProvider>
  );
}
```

Endpoints must be absolute URLs, such as the routes `@saystack/server` serves. Add `realtime: { url }` to
`useNativeDictation` to stream words while they are said. `voiceTheme("dark", overrides)` builds a theme, and a
spotlight's `container` prop mounts it in a full-window host.

## Related packages

[`@saystack/react`](https://www.npmjs.com/package/@saystack/react),
[`@saystack/core`](https://www.npmjs.com/package/@saystack/core),
[`@saystack/server`](https://www.npmjs.com/package/@saystack/server),
[`@saystack/engine-openai-compatible`](https://www.npmjs.com/package/@saystack/engine-openai-compatible).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
