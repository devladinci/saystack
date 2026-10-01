export interface IThreadMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export const THREAD: readonly IThreadMessage[] = [
  { id: "ask-read", role: "user", text: "Hey, can you read replies out loud?" },
  {
    id: "hello",
    role: "assistant",
    text: "Yes. Press the speaker under any reply and I'll read it to you, one word at a time.",
  },
  { id: "ask-aura", role: "user", text: "How does the voice aura turn my voice into colors?" },
  {
    id: "aura",
    role: "assistant",
    text: [
      "Sure. The aura splits your voice into **six frequency bands**, from the low hum of vowels up to the hiss of an s.",
      "",
      "Each band has its own color. When you are silent, all six sit on top of each other and add up to *white*. When you speak, each band rises with its own energy, so the colors pull apart. Where two bands still overlap, their colors mix, like light through a prism.",
      "",
      "| Band | Range | Carries |",
      "| --- | --- | --- |",
      "| 1 | 80–170 Hz | Low voices |",
      "| 2 | 170–370 Hz | High voices |",
      "| 3 | 370–800 Hz | Vowel body |",
      "| 4 | 0.8–1.7 kHz | Vowel color |",
      "| 5 | 1.7–3.7 kHz | Consonants |",
      "| 6 | 3.7–8 kHz | Hiss: s, sh, f |",
      "",
      "```ts",
      "const levels = createAudioLevels({ bands: 6 });",
      "const aura = createAura({ anchor: composer, levels: () => levels.read(), style: { bands: 6 } });",
      "",
      "levels.listen(await navigator.mediaDevices.getUserMedia({ audio: true }));",
      'aura.setState("active");',
      "```",
      "",
      "Vowels light up the warm colors. Sounds like s and sh push the blue and violet bands.",
    ].join("\n"),
  },
];

export const CANNED_REPLY =
  "This is a playground, so my replies are canned. Press the speaker under any reply to hear it again.";

export const DEMO_DICTATION =
  "Could you read your last answer out loud? I want to see how the colors move while you talk.";

export const SPOKEN_REPLIES: readonly string[] = [
  ...THREAD.filter((message) => message.role === "assistant").map((message) => message.text),
  CANNED_REPLY,
];
