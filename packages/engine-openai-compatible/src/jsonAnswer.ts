function stripFences(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);

  if (fenced !== null) {
    return (fenced[1] ?? content).trim();
  }

  return content.trim();
}

function parseObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The JSON object in a model's answer, whether it came bare, fenced, or wrapped in a sentence.
export function readJsonAnswer(content: string): Record<string, unknown> | null {
  const stripped = stripFences(content);
  const whole = parseObject(stripped);

  if (whole !== null) {
    return whole;
  }

  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  return start === -1 || end <= start ? null : parseObject(stripped.slice(start, end + 1));
}
