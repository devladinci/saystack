# saystack playground

The site where people try saystack before installing it: dictate into a composer, hear a reply read aloud with
read-along, and tune every aura option with the live band meters. It runs on the packages in this repo and needs no
server, so it is hosted as a static site on GitHub Pages.

```bash
pnpm install && pnpm -r build
pnpm --filter @saystack/playground dev
```

## How it works without a server

- **Read aloud** uses `ReadAloudProvider`'s `synthesize` option. Instead of calling a speech engine, it plays
  pre-recorded clips with word marks ([`src/clips.ts`](src/clips.ts)), so the read-along, the aura and the player run
  exactly as they do against a real engine.
- **Dictation** uses `useWebDictation` with a custom `recorder` and `live` source. The demo clip plays as if it came
  from the microphone and streams its words at the moments they are spoken. With the microphone, the words come from
  the browser's own speech recognition where there is one.
- **Settings** live in the URL hash, so a link brings back the same look. **Copy code** turns them into the options
  for `useDictationAura` and `<ReadAloudAura>`, or, in the mobile view, for `DictationSpotlight` and
  `ReadAloudSpotlight`.

**Desktop | Mobile** in the header switches between the chat and a phone running the same conversation. The phone
shows `@saystack/react-native`'s spotlights, drawn here with the web packages: while you dictate, the chat blurs and
the words appear in the middle before they drop into the draft; while a reply is read, it lifts above the blur with
its words marked and the player waits at the bottom. In both, the aura hangs from the top of the screen. On a real
phone the mobile view fills the screen.

## The demo voice

The clips in `public/clips` were made with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), which is
Apache-2.0, with the voices `af_heart` (replies) and `am_michael` (dictation). After changing the text in
[`src/content.ts`](src/content.ts), render them again:

```bash
pip install "kokoro>=0.9.4" soundfile    # and ffmpeg
pnpm --filter @saystack/playground clips
```

The script splits the replies with the library's own `speechChunks`, so every chunk the read-aloud asks for has a
clip. A test fails if one is missing.
