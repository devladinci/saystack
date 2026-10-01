# @saystack/core

The engine-agnostic core of saystack. It turns LLM output into speakable text, chunks it so playback can start
before the reply is complete, and runs speech sessions, word timings and the aura maths. It has no runtime
dependencies and knows no vendor or platform.

Use it on its own to prepare text for any TTS engine, or to plug your own engine into saystack. The UI packages
build on it.

## Install

```bash
npm install @saystack/core
```

## Speakable text

```ts
import { needsSummary, speechChunks, toReadingBlocks, toSpeechText } from "@saystack/core";

const reply = [
  "## Release",
  "",
  "The build **passed**. Run `pnpm release` to publish it.",
  "",
  "| Step | Time |",
  "| ---- | ---- |",
  "| Test | 30s  |",
].join("\n");

const speakable = toSpeechText(reply);
const chunks = speechChunks(speakable);
const blocks = toReadingBlocks(reply);
const isWorthRewriting = needsSummary(reply);
```

`toSpeechText` drops the markdown, code and tables and ends every line as a sentence:
`Release. The build passed. Run pnpm release to publish it.` `speechChunks` splits that into pieces that start
short and grow, so the first audio is ready quickly. `toReadingBlocks` gives what a reader sees: one block per
heading, paragraph or list item, without code and tables. `needsSummary` is true for replies with code, tables or
a lot of text, which are better rewritten before they are spoken.

## Your own engine

An engine implements `ITtsAdapter`, `ISttAdapter` or `ISttRealtimeAdapter`. Failures come back as coded results
instead of exceptions:

```ts
import type { ITtsAdapter, ITtsSynthesizeInput, ITtsSynthesizeResult } from "@saystack/core";

export function createMyTtsAdapter(url: string): ITtsAdapter {
  const synthesize = async ({ text, signal }: ITtsSynthesizeInput): Promise<ITtsSynthesizeResult> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: signal ?? null,
    }).catch(() => null);

    if (response === null || !response.ok) {
      return { ok: false, errorCode: "TTS_UNAVAILABLE", message: "the engine did not answer" };
    }

    return { ok: true, audio: await response.arrayBuffer(), mimeType: "audio/wav" };
  };

  return { capabilities: { streaming: false, voiceCloning: false }, synthesize };
}
```

`@saystack/server` serves any adapter over HTTP. `validateConfig` checks an `IConfig` (engine URLs, models,
tokens, languages) and returns coded errors instead of throwing.

## Related packages

[`@saystack/web`](https://www.npmjs.com/package/@saystack/web),
[`@saystack/react`](https://www.npmjs.com/package/@saystack/react),
[`@saystack/react-web`](https://www.npmjs.com/package/@saystack/react-web),
[`@saystack/react-native`](https://www.npmjs.com/package/@saystack/react-native),
[`@saystack/server`](https://www.npmjs.com/package/@saystack/server),
[`@saystack/engine-openai-compatible`](https://www.npmjs.com/package/@saystack/engine-openai-compatible).
See the [saystack README](https://github.com/devladinci/saystack#readme) for how they fit together.

## License

MIT
