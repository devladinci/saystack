// An engine's own request body keys are the operator's to name, not the caller's. These names are held
// back even if an operator lists one, because the adapter already sends them.
const RESERVED = new Set(["model", "input", "response_format", "voice", "ref_audio", "ref_text", "max_tokens"]);

export function engineFields(names: readonly string[]): ReadonlySet<string> {
  return new Set(names.filter((name) => name.trim().length > 0 && !RESERVED.has(name.trim())));
}
