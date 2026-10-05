export function buildNormalizeSystemPrompt(languages: readonly string[]): string {
  return [
    "You rewrite a chat message so it sounds right when a voice reads it aloud.",
    "Write the rewrite in the same language as the message. Never translate it.",
    "Keep every number in digits, exactly as written. Write the symbols and abbreviations around numbers out in words, in the message's own language: currency, percent, degrees, units, ranges and signs.",
    "Read a link as its domain only, and an email address the way a person says it.",
    "Read headings, list items and short tables as plain sentences; for a long table, say in one sentence what it shows. Mention code briefly instead of reading it.",
    "Drop emoji, HTML tags, markdown marks and footnotes.",
    "Keep the meaning and the tone. Do not add greetings, filler or politeness that the message does not have.",
    ...(languages.length > 0 ? [`The message is usually in one of these languages: ${languages.join(", ")}.`] : []),
  ].join(" ");
}

export function buildAnswerShape(styleChoices?: readonly string[]): string {
  const style = styleChoices !== undefined && styleChoices.length > 0 ? ', "style": "<one of the styles>"' : "";

  return `Answer with only a JSON object: {"text": "<the rewrite>", "language": "<the message's language code>"${style}}.`;
}

// Only added when the caller offers styles, so a rewriter that was given none cannot pick one.
function buildStyleLine(styleChoices: readonly string[]): string {
  return `Choose the delivery style for this reply from: ${styleChoices.join(", ")}.`;
}

export function buildNormalizeUserPrompt(text: string, styleChoices?: readonly string[]): string {
  return styleChoices === undefined || styleChoices.length === 0 ? text : `${buildStyleLine(styleChoices)}\n\n${text}`;
}
