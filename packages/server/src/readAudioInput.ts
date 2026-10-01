import type { Context } from "hono";

import type { IAudioReadResult } from "./types.js";

const isRawAudio = (contentType: string): boolean =>
  contentType === "" || contentType.startsWith("audio/") || contentType === "application/octet-stream";

export async function readAudioInput(c: Context, maxBodyBytes: number): Promise<IAudioReadResult> {
  const contentType = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";

  const declaredLength = Number(c.req.header("content-length") ?? "0");

  if (declaredLength > maxBodyBytes) {
    return {
      ok: false,
      errorCode: "AUDIO_TOO_LARGE",
      message: `content-length ${declaredLength} exceeds limit ${maxBodyBytes}`,
    };
  }

  const isMultipart = contentType.startsWith("multipart/form-data");

  if (!isMultipart && !isRawAudio(contentType)) {
    return { ok: false, errorCode: "UNSUPPORTED_MEDIA", message: `unsupported content-type '${contentType}'` };
  }

  // content-length is only what the client claims, and a chunked upload sends none, so the bytes are counted too.
  const body = await readCapped(c.req.raw.body, maxBodyBytes);

  if (body === null) {
    return { ok: false, errorCode: "AUDIO_TOO_LARGE", message: `body exceeds limit ${maxBodyBytes}` };
  }

  if (isMultipart) {
    return readMultipart(body, c.req.header("content-type") ?? "");
  }

  const mimeType = contentType === "" ? undefined : contentType;
  const filename = c.req.header("x-audio-filename");
  const language = c.req.header("x-audio-language");

  return {
    ok: true,
    audio: body,
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(language !== undefined && language.length > 0 ? { language } : {}),
  };
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (stream === null) {
    return new Uint8Array(0);
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

async function readMultipart(body: Uint8Array, contentType: string): Promise<IAudioReadResult> {
  let form: FormData;

  try {
    form = await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch {
    return { ok: false, errorCode: "ENGINE_REJECTED_INPUT", message: "malformed multipart body" };
  }

  const file = form.get("file");

  if (file === null) {
    return { ok: false, errorCode: "EMPTY_AUDIO", message: "missing 'file' field" };
  }

  if (!(file instanceof Blob)) {
    return { ok: false, errorCode: "UNSUPPORTED_MEDIA", message: "'file' field must be binary" };
  }

  const audio = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type === "" ? undefined : file.type;
  const rawName = (file as { name?: unknown }).name;
  const filename = typeof rawName === "string" && rawName.length > 0 ? rawName : undefined;
  const prompt = form.get("prompt");
  const language = form.get("language");

  return {
    ok: true,
    audio,
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(filename !== undefined ? { filename } : {}),
    ...(typeof prompt === "string" && prompt.length > 0 ? { prompt } : {}),
    ...(typeof language === "string" && language.length > 0 ? { language } : {}),
  };
}
