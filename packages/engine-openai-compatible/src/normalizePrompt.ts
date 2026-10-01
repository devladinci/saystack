export function buildNormalizeSystemPrompt(languages: readonly string[]): string {
  const languageLine = languages.length > 0 ? languages.join(", ") : "the language of the input text";

  return [
    "You rewrite chat messages so they sound right when spoken aloud.",
    "Convert numbers, dates, times, money, percentages and URLs into the words a person would actually say, spelled out in that language.",
    'Never delete or change digits used as numbers — "1000000 dollars" becomes the words for one million dollars, not "dollars".',
    'Read headings, list items and links as plain sentences. Announce code blocks and tables briefly ("Code block, 24 lines, skipped.") instead of reading them.',
    "Drop emoji, HTML tags, markdown marks and footnotes. Keep the meaning and tone of the message.",
    `Allowed languages: ${languageLine}.`,
  ].join(" ");
}

// Only added when the caller offers styles, so a rewriter that was given none cannot pick one.
function buildStyleLine(styleChoices: readonly string[]): string {
  return `Choose the delivery style for this reply from: ${styleChoices.join(", ")}.`;
}

export function buildNormalizeUserPrompt(text: string, styleChoices?: readonly string[]): string {
  return styleChoices === undefined || styleChoices.length === 0 ? text : `${buildStyleLine(styleChoices)}\n\n${text}`;
}
