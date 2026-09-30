export interface IChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type IChatReply = { ok: true; text: string } | { ok: false; message: string };

export async function askChat(turns: readonly IChatTurn[]): Promise<IChatReply> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: turns }),
  }).catch(() => null);

  if (response === null) {
    return { ok: false, message: "The chat server is not running." };
  }

  const body: { text?: unknown; error?: unknown } = await response.json().catch(() => ({}));

  if (!response.ok || typeof body.text !== "string") {
    return { ok: false, message: typeof body.error === "string" ? body.error : "The chat model did not answer." };
  }

  return { ok: true, text: body.text };
}

export async function rewriteForSpeech(markdown: string, signal: AbortSignal): Promise<string | null> {
  const response = await fetch("/voice/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: markdown }),
    signal,
  }).catch(() => null);

  if (response === null || !response.ok) {
    return null;
  }

  const body: { text?: unknown } = await response.json().catch(() => ({}));

  return typeof body.text === "string" ? body.text : null;
}
