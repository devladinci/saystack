// How a rewrite's style reaches a speech engine differs per server: a field in the request body, or a tag
// pasted into the text. Both the vocabulary and the channel are the caller's to declare — saystack ships
// no styles of its own, and a style nobody declared is dropped rather than guessed at.
export interface IStyleRule {
  // What is sent to the engine.
  readonly value: string;
  // The word a rewrite model is offered, and the word it may send back; defaults to value.
  readonly label?: string;
}

export type IStyleChannel =
  | { readonly mode: "none" }
  | { readonly mode: "field"; readonly field: string }
  | { readonly mode: "tag"; readonly template: string };

export interface IStyleMap {
  readonly channel: IStyleChannel;
  readonly rules: readonly IStyleRule[];
}

export const NO_STYLE_CHANNEL: IStyleChannel = { mode: "none" };

export const EMPTY_STYLE_MAP: IStyleMap = { channel: NO_STYLE_CHANNEL, rules: [] };

export const STYLE_SLOT = "{style}";

export interface IStyledText {
  readonly text: string;
  readonly fields: Readonly<Record<string, string>>;
  // How many characters a tag channel added to the front of the text.
  readonly prefixLength: number;
}

const plainText = (text: string): IStyledText => ({ text, fields: {}, prefixLength: 0 });

// A tag channel carries no words, but it is still characters in front of the text: whoever counts characters
// against a limit has to leave room for the longest tag the map can produce.
export function styleReserve(map: IStyleMap): number {
  const { channel } = map;

  if (channel.mode !== "tag") {
    return 0;
  }

  const longest = map.rules.reduce((max, rule) => Math.max(max, rule.value.length), 0);

  return Math.max(0, channel.template.length - STYLE_SLOT.length) + longest;
}

export function matchStyle(map: IStyleMap, candidate: unknown): IStyleRule | undefined {
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return undefined;
  }

  const wanted = candidate.trim().toLowerCase();

  return map.rules.find((rule) => {
    const label = rule.label ?? rule.value;

    return rule.value.toLowerCase() === wanted || label.toLowerCase() === wanted;
  });
}

export function styleChoices(map: IStyleMap): readonly string[] {
  return map.rules.map((rule) => rule.label ?? rule.value);
}

export function applyStyle(channel: IStyleChannel, value: string | undefined, text: string): IStyledText {
  const plain = plainText(text);

  if (value === undefined || channel.mode === "none") {
    return plain;
  }

  if (channel.mode === "tag") {
    if (!channel.template.includes(STYLE_SLOT)) {
      return plain;
    }

    // A function replacer keeps $ patterns in a style value from being read as replacement syntax.
    const tag = channel.template.replaceAll(STYLE_SLOT, () => value);

    return { text: `${tag}${text}`, fields: {}, prefixLength: tag.length };
  }

  if (channel.field.trim().length === 0) {
    return plain;
  }

  return { text, fields: { [channel.field]: value }, prefixLength: 0 };
}
